"""Round-robin tournament between admitted players.

Every pair plays a series of games. Games come in mirrored couples: same seeds, each
player shooting first once (with "hit again" rules, shooting first is an advantage).
Each game runs in its own process so a hung bot can be killed. A bot that fails (error,
illegal move, bad placement, timeout) loses that game and the tournament goes on.

Time budgets are per game and cumulative: one for ``create`` and one for every other call
(placement plus all shots). Move time is never a tie-break.
"""

from __future__ import annotations

import argparse
import copy
import json
import random
import sys
import threading
import time
import traceback
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

from battleship import elo
from battleship.game import (
    DEFAULT_FLEET,
    DEFAULT_SIZE,
    apply_shot,
    is_legal_shot,
    is_terminal,
    new_board,
    next_attacker,
    validate_fleet,
    validate_placement,
    view_for_attacker,
)
from battleship.manifest import ManifestEntry
from battleship.player import Player
from battleship.registry import PlayerInfo, default_manifests, load_class, load_players

if TYPE_CHECKING:  # multiprocessing is imported lazily: the browser (Pyodide) has no processes
    from multiprocessing.connection import Connection

FORFEIT_TIMEOUT = "forfeit_timeout"
FORFEIT_ERROR = "forfeit_error"
FORFEIT_ILLEGAL = "forfeit_illegal"
FORFEIT_BAD_PLACEMENT = "forfeit_bad_placement"
FORFEIT_BUILD_TIMEOUT = "forfeit_build_timeout"
FORFEIT_BUILD_ERROR = "forfeit_build_error"

FORMATS = ("simple", "league", "championship")
KILL_SLACK = 1.0  # extra seconds a silent game process gets before it is killed
STARTUP_TIMEOUT = 60.0  # seconds for a game process to import everything and start

GameSpec = dict[str, Any]
GameRecord = dict[str, Any]
OnCall = Callable[[int, str, float], None]


@dataclass(frozen=True)
class Config:
    format: str = "league"
    games_per_pair: int = 20
    knockout_games: int = 10  # championship: games per knockout match
    top: int = 4  # championship: league places that reach the knockout
    seed: int = 0
    size: int = DEFAULT_SIZE
    fleet: tuple[int, ...] = DEFAULT_FLEET
    time_budget: float = 2.0
    build_budget: float = 2.0
    subprocess: bool = True
    jobs: int = 4


# --- one game ----------------------------------------------------------------------------


class _Forfeit(Exception):
    def __init__(self, player: int, reason: str, detail: str):
        super().__init__(detail)
        self.player, self.reason, self.detail = player, reason, detail

    def to_json(self) -> dict[str, Any]:
        return {"player": self.player, "reason": self.reason, "detail": self.detail}


def run_game(
    classes: Sequence[type[Player]], spec: GameSpec, on_call: OnCall | None = None
) -> GameRecord:
    """Play one game between ``classes[0]`` and ``classes[1]``. Bot faults never raise.

    ``spec`` holds ``size``, ``fleet``, ``seeds`` (one per player), ``first`` (0 or 1),
    ``time_budget`` and ``build_budget``. ``on_call(player, kind, seconds_left)`` runs
    before every bot call (``kind`` is "build", "place" or "shoot"); the subprocess runner
    uses it to know whose clock is ticking.

    Returns ``{"first", "winner" (0, 1 or None for a draw), "forfeits", "shots", "hits"}``.
    """
    size, fleet, first = spec["size"], list(spec["fleet"]), spec["first"]
    budgets = {"build": spec["build_budget"], "play": spec["time_budget"]}
    clocks = {"build": [0.0, 0.0], "play": [0.0, 0.0]}
    shots, hits = [0, 0], [0, 0]

    def call(who: int, kind: str, fn: Callable[..., Any], *args: Any) -> Any:
        phase = "build" if kind == "build" else "play"
        clock = clocks[phase]
        if on_call:
            on_call(who, kind, max(0.0, budgets[phase] - clock[who]))
        start = time.perf_counter()
        try:
            value = fn(*args)
        except (Exception, SystemExit) as exc:
            reason = FORFEIT_BUILD_ERROR if phase == "build" else FORFEIT_ERROR
            raise _Forfeit(who, reason, f"{kind}: {exc!r}") from None
        finally:
            clock[who] += time.perf_counter() - start
        if clock[who] > budgets[phase]:
            reason = FORFEIT_BUILD_TIMEOUT if phase == "build" else FORFEIT_TIMEOUT
            raise _Forfeit(who, reason, f"{kind}: used {clock[who]:.2f}s of {budgets[phase]}s")
        return value

    def record(winner: int | None, forfeits: list[_Forfeit]) -> GameRecord:
        return {
            "first": first,
            "winner": winner,
            "forfeits": [f.to_json() for f in forfeits],
            "shots": shots,
            "hits": hits,
        }

    def for_both(step: Callable[[int], Any]) -> tuple[list[Any], list[_Forfeit]]:
        results: list[Any] = [None, None]
        forfeits = []
        for who in (0, 1):
            try:
                results[who] = step(who)
            except _Forfeit as f:
                forfeits.append(f)
        return results, forfeits

    def build(who: int) -> Player:
        player = call(who, "build", classes[who].create, spec["seeds"][who])
        if not isinstance(player, Player):
            raise _Forfeit(who, FORFEIT_BUILD_ERROR, f"create() returned {type(player).__name__}")
        return player

    def place(who: int) -> dict[str, Any]:
        placement = call(who, "place", players[who].choose_placement, size, list(fleet))
        try:
            placement = json.loads(json.dumps(placement))
        except (TypeError, ValueError):
            raise _Forfeit(who, FORFEIT_BAD_PLACEMENT, "placement is not plain data") from None
        reason = validate_placement(size, fleet, placement)
        if reason:
            raise _Forfeit(who, FORFEIT_BAD_PLACEMENT, reason)
        return new_board(size, fleet, placement)

    players, forfeits = for_both(build)
    if not forfeits:
        boards, forfeits = for_both(place)
    if forfeits:
        return record(None if len(forfeits) == 2 else 1 - forfeits[0].player, forfeits)

    attacker = first
    while True:
        defender = 1 - attacker
        view = view_for_attacker(boards[defender])
        try:
            shot = call(attacker, "shoot", players[attacker].choose_shot, copy.deepcopy(view))
            if not is_legal_shot(view, shot):
                raise _Forfeit(
                    attacker, FORFEIT_ILLEGAL, f"shot {shot!r} is off the board or repeated"
                )
        except _Forfeit as f:
            return record(defender, [f])
        boards[defender], result = apply_shot(boards[defender], shot)
        shots[attacker] += 1
        hits[attacker] += result["outcome"] != "miss"
        if is_terminal(boards[defender]):
            return record(attacker, [])
        attacker = next_attacker(attacker, result)


# --- one game in its own process ---------------------------------------------------------


def _worker(conn: Connection, entries: list[ManifestEntry], spec: GameSpec) -> None:
    try:
        classes = [load_class(entry) for entry in entries]
        result = run_game(
            classes, spec, on_call=lambda who, kind, left: conn.send(("call", who, kind, left))
        )
        conn.send(("done", result))
    except BaseException:
        conn.send(("crash", traceback.format_exc()))
    finally:
        conn.close()


def _killed(spec: GameSpec, who: int, reason: str, detail: str) -> GameRecord:
    forfeit = {"player": who, "reason": reason, "detail": detail}
    return {
        "first": spec["first"],
        "winner": 1 - who,
        "forfeits": [forfeit],
        "shots": None,
        "hits": None,
    }


def run_game_in_subprocess(entries: Sequence[ManifestEntry], spec: GameSpec) -> GameRecord:
    """Like ``run_game``, but in a fresh process that is killed if a bot stops answering.

    The process announces each bot call with the time that bot has left; if the next
    message does not arrive within that time plus ``KILL_SLACK``, the bot forfeits. Stats
    of killed games (shots, hits) are lost and recorded as None.
    """
    import multiprocessing

    ctx = multiprocessing.get_context("spawn")
    receiver, sender = ctx.Pipe(duplex=False)
    process = ctx.Process(target=_worker, args=(sender, list(entries), spec), daemon=True)
    process.start()
    sender.close()
    current: tuple[int, str, float] | None = None
    timeout = STARTUP_TIMEOUT
    try:
        while True:
            if not receiver.poll(timeout):
                if current is None:
                    raise RuntimeError("game process did not start in time")
                who, kind, left = current
                reason = FORFEIT_BUILD_TIMEOUT if kind == "build" else FORFEIT_TIMEOUT
                return _killed(spec, who, reason, f"{kind}: no answer within {left:.2f}s, killed")
            try:
                message = receiver.recv()
            except EOFError:
                if current is None:
                    raise RuntimeError("game process died before starting") from None
                who, kind, _ = current
                process.join(1)
                reason = FORFEIT_BUILD_ERROR if kind == "build" else FORFEIT_ERROR
                detail = f"{kind}: process died (exit code {process.exitcode})"
                return _killed(spec, who, reason, detail)
            if message[0] == "call":
                current = message[1:]
                timeout = message[3] + KILL_SLACK
            elif message[0] == "done":
                return message[1]  # type: ignore[no-any-return]
            else:
                raise RuntimeError(f"game process crashed:\n{message[1]}")
    finally:
        if process.is_alive():
            process.kill()
        process.join()
        receiver.close()


# --- the tournament ----------------------------------------------------------------------
#
# A tournament is a sequence of stages: the round-robin ("league"), then, for the
# championship format, knockout rounds between the best of the league. Which games come
# next is a pure function of the players, the config and the games played so far
# (next_games), so the CLI and the browser drive exactly the same tournament.

Game = tuple[int, int, GameSpec]  # (i, j, spec): players[i] is player 0
Played = tuple[int, int, GameSpec, GameRecord]

ROUND_NAMES = {2: "final", 4: "semifinal", 8: "quarterfinal"}


def _series(
    i: int, j: int, players: Sequence[PlayerInfo], n: int, config: Config, tag: str = ""
) -> list[Game]:
    """``n`` games between players ``i`` and ``j``, in mirrored couples.

    Games ``2m`` and ``2m+1`` share their seeds and swap who shoots first. Seeds depend
    only on the tournament seed, the stage ``tag`` and the two names, so adding a player
    does not change the games between the others.
    """
    a, b = players[i], players[j]
    prefix = f"{config.seed}:{tag + ':' if tag else ''}{a.name}:{b.name}"
    games = []
    for k in range(n):
        rng = random.Random(f"{prefix}:{k // 2}")
        spec = {
            "size": config.size,
            "fleet": list(config.fleet),
            "seeds": [rng.randrange(2**31), rng.randrange(2**31)],
            "first": k % 2,
            "time_budget": config.time_budget,
            "build_budget": config.build_budget,
        }
        games.append((i, j, spec))
    return games


def schedule(players: Sequence[PlayerInfo], config: Config) -> list[Game]:
    """Every game of the round-robin, as ``(i, j, spec)`` with ``players[i]`` as player 0."""
    games = []
    for i in range(len(players)):
        for j in range(i + 1, len(players)):
            games += _series(i, j, players, config.games_per_pair, config)
    return games


def bracket_size(players: int, top: int) -> int:
    """The largest power of two that is at most ``top`` and at most ``players``."""
    size = 1
    while size * 2 <= min(top, players):
        size *= 2
    return size


def _bracket(size: int) -> list[int]:
    """League positions in bracket order, so 1st and 2nd can only meet in the final.

    For 4: [0, 3, 1, 2] (1st v 4th, 2nd v 3rd); for 8: [0, 7, 3, 4, 1, 6, 2, 5].
    """
    order = [0]
    while len(order) < size:
        double = 2 * len(order)
        order = [x for seed in order for x in (seed, double - 1 - seed)]
    return order


def total_games(players: Sequence[PlayerInfo], config: Config) -> int:
    n = len(players)
    league = n * (n - 1) // 2 * config.games_per_pair
    if config.format != "championship":
        return league
    return league + (bracket_size(n, config.top) - 1) * config.knockout_games


def _new_stats() -> dict[str, Any]:
    return {
        "played": 0,
        "wins": 0,
        "losses": 0,
        "draws": 0,
        "forfeits": 0,
        "forfeit_reasons": {},
        "wins_first": 0,
        "wins_second": 0,
        "shots": 0,
        "hits": 0,
        "win_shots": [],
    }


def _config_json(config: Config) -> dict[str, Any]:
    hidden = {"subprocess", "jobs"}
    if config.format != "championship":
        hidden |= {"knockout_games", "top"}
    return {k: v for k, v in asdict(config).items() if k not in hidden} | {
        "fleet": list(config.fleet)
    }


def standings(
    players: Sequence[PlayerInfo],
    games: Sequence[Game],
    records: Sequence[GameRecord],
    config: Config,
) -> dict[str, Any]:
    """Turn the league's game records into the leaderboard (a JSON-ready dict)."""
    stats = {p.name: _new_stats() for p in players}
    ratings = {p.name: elo.INITIAL for p in players}
    pairs: dict[tuple[str, str], dict[str, Any]] = {}
    for (i, j, _), rec in zip(games, records, strict=True):
        names = (players[i].name, players[j].name)
        pair = pairs.setdefault(
            names, {"a": names[0], "b": names[1], "wins_a": 0, "wins_b": 0, "draws": 0}
        )
        winner = rec["winner"]
        for idx, name in enumerate(names):
            s = stats[name]
            s["played"] += 1
            if winner is None:
                s["draws"] += 1
            elif winner == idx:
                s["wins"] += 1
                s["wins_first" if rec["first"] == idx else "wins_second"] += 1
                if not rec["forfeits"]:
                    s["win_shots"].append(rec["shots"][idx])
            else:
                s["losses"] += 1
            if rec["shots"] is not None:
                s["shots"] += rec["shots"][idx]
                s["hits"] += rec["hits"][idx]
        for forfeit in rec["forfeits"]:
            s = stats[names[forfeit["player"]]]
            s["forfeits"] += 1
            s["forfeit_reasons"][forfeit["reason"]] = (
                s["forfeit_reasons"].get(forfeit["reason"], 0) + 1
            )
        if winner is None:
            pair["draws"] += 1
        else:
            pair["wins_a" if winner == 0 else "wins_b"] += 1
        score = 0.5 if winner is None else 1.0 - winner
        ratings[names[0]], ratings[names[1]] = elo.update(
            ratings[names[0]], ratings[names[1]], score
        )

    table = []
    for p in players:
        s = stats[p.name]
        table.append(
            {
                **p.to_json(),
                "points": s["wins"] + 0.5 * s["draws"],
                "elo": round(ratings[p.name], 1),
                **{k: s[k] for k in ("played", "wins", "losses", "draws", "forfeits")},
                "forfeit_reasons": dict(sorted(s["forfeit_reasons"].items())),
                "wins_first": s["wins_first"],
                "wins_second": s["wins_second"],
                "avg_shots_to_win": (
                    round(sum(s["win_shots"]) / len(s["win_shots"]), 1) if s["win_shots"] else None
                ),
                "hit_rate": round(s["hits"] / s["shots"], 3) if s["shots"] else None,
            }
        )
    primary = "points" if config.format == "simple" else "elo"
    table.sort(key=lambda row: (-row[primary], row["forfeits"], row["name"]))
    for rank, row in enumerate(table, 1):
        row["rank"] = rank
    return {
        "format": config.format,
        "config": _config_json(config),
        "standings": table,
        "pairs": list(pairs.values()),
    }


def _knockout(
    players: Sequence[PlayerInfo], config: Config, played: Sequence[Played]
) -> dict[str, Any]:
    """Replay the knockout stage from the games played so far.

    Returns ``{"table", "rounds", "pending", "champion"}``: the league leaderboard, the
    finished rounds, the games still to play (``(round name, games)`` or None) and the
    champion's index (None until the final is over). A drawn series goes to the player
    with the better league position.
    """
    league = schedule(players, config)
    table = standings(players, league, [p[3] for p in played[: len(league)]], config)
    index = {p.name: k for k, p in enumerate(players)}
    position = {index[row["name"]]: row["rank"] for row in table["standings"]}
    size = bracket_size(len(players), config.top)
    seeds = [index[row["name"]] for row in table["standings"][:size]]
    alive = [seeds[s] for s in _bracket(size)]
    rest = list(played[len(league) :])
    rounds: list[dict[str, Any]] = []
    while len(alive) > 1:
        name = ROUND_NAMES.get(len(alive), f"round_of_{len(alive)}")
        pairs = [(alive[k], alive[k + 1]) for k in range(0, len(alive), 2)]
        games = [
            g for i, j in pairs for g in _series(i, j, players, config.knockout_games, config, name)
        ]
        if len(rest) < len(games):
            return {
                "table": table,
                "rounds": rounds,
                "pending": (name, games[len(rest) :]),
                "champion": None,
            }
        matches, winners = [], []
        for m, (i, j) in enumerate(pairs):
            chunk = rest[m * config.knockout_games : (m + 1) * config.knockout_games]
            wins_a = sum(1 for p in chunk if p[3]["winner"] == 0)
            wins_b = sum(1 for p in chunk if p[3]["winner"] == 1)
            if wins_a != wins_b:
                winner = i if wins_a > wins_b else j
            else:
                winner = i if position[i] < position[j] else j
            winners.append(winner)
            matches.append(
                {
                    "a": players[i].name,
                    "b": players[j].name,
                    "wins_a": wins_a,
                    "wins_b": wins_b,
                    "draws": len(chunk) - wins_a - wins_b,
                    "winner": players[winner].name,
                }
            )
        rest = rest[len(games) :]
        rounds.append({"name": name, "matches": matches})
        alive = winners
    return {"table": table, "rounds": rounds, "pending": None, "champion": alive[0]}


def next_games(
    players: Sequence[PlayerInfo], config: Config, played: Sequence[Played]
) -> tuple[str, list[Game]] | None:
    """The stage still being played and its remaining games, or None when it is all over.

    ``players`` must be in a fixed order (``run_tournament`` sorts them by name).
    """
    league = schedule(players, config)
    if len(played) < len(league):
        return "league", league[len(played) :]
    if config.format != "championship":
        return None
    pending: tuple[str, list[Game]] | None = _knockout(players, config, played)["pending"]
    return pending


def final_leaderboard(
    players: Sequence[PlayerInfo], config: Config, played: Sequence[Played]
) -> dict[str, Any]:
    """The leaderboard once ``next_games`` returns None."""
    league = schedule(players, config)
    if config.format != "championship":
        return standings(players, league, [p[3] for p in played], config)
    ko = _knockout(players, config, played)
    if ko["pending"] is not None:
        raise ValueError("the championship is not finished")
    table: dict[str, Any] = ko["table"]
    # Placement: how far each player got in the bracket, then the league position.
    reached = {row["name"]: -1 for row in table["standings"]}
    for r, rnd in enumerate(ko["rounds"]):
        for match in rnd["matches"]:
            reached[match["a"]] = reached[match["b"]] = r
    champion = players[ko["champion"]].name
    reached[champion] = len(ko["rounds"])
    table["standings"].sort(key=lambda row: (-reached[row["name"]], row["rank"]))
    for rank, row in enumerate(table["standings"], 1):
        row["league_rank"], row["rank"] = row["rank"], rank
    table["knockout"] = {
        "size": bracket_size(len(players), config.top),
        "games_per_match": config.knockout_games,
        "rounds": ko["rounds"],
        "champion": champion,
    }
    return table


def run_tournament(
    players: Sequence[PlayerInfo],
    config: Config,
    progress: Callable[[int, int], None] | None = None,
) -> dict[str, Any]:
    """Play every stage of the tournament and return the leaderboard.

    The result depends only on the players, the config and its seed (bar timeouts).
    """
    if config.format not in FORMATS:
        raise ValueError(f"unknown format {config.format!r}; choose from {FORMATS}")
    players = sorted(players, key=lambda p: p.name)
    total = total_games(players, config)
    done, lock = 0, threading.Lock()

    def play(game: Game) -> GameRecord:
        nonlocal done
        i, j, spec = game
        if config.subprocess:
            entries = [players[i].entry, players[j].entry]
            if entries[0] is None or entries[1] is None:
                raise ValueError("subprocess mode needs players loaded from a manifest")
            rec = run_game_in_subprocess([entries[0], entries[1]], spec)
        else:
            rec = run_game([players[i].cls, players[j].cls], spec)
        if progress:
            with lock:
                done += 1
                progress(done, total)
        return rec

    played: list[Played] = []
    while (stage := next_games(players, config, played)) is not None:
        games = stage[1]
        if config.subprocess and config.jobs > 1:
            with ThreadPoolExecutor(config.jobs) as pool:
                records = list(pool.map(play, games))
        else:
            records = [play(game) for game in games]
        played += [(i, j, spec, rec) for (i, j, spec), rec in zip(games, records, strict=True)]
    return final_leaderboard(players, config, played)


# --- command line ------------------------------------------------------------------------


def _fleet(text: str) -> tuple[int, ...]:
    try:
        return tuple(int(x) for x in text.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError(
            "fleet must be comma-separated ints, e.g. 5,4,3,3,2"
        ) from None


def _print_table(leaderboard: dict[str, Any]) -> None:
    primary = "points" if leaderboard["format"] == "simple" else "elo"
    print(
        f"{'#':>2}  {'player':<18} {primary:>7}  {'W-L-D':>11}  "
        f"{'forf':>4}  {'shots':>5}  {'hit%':>5}"
    )
    for row in leaderboard["standings"]:
        wld = f"{row['wins']}-{row['losses']}-{row['draws']}"
        shots = row["avg_shots_to_win"] if row["avg_shots_to_win"] is not None else "-"
        rate = f"{100 * row['hit_rate']:.1f}" if row["hit_rate"] is not None else "-"
        print(
            f"{row['rank']:>2}  {row['icon']} {row['name']:<16} {row[primary]:>7}  "
            f"{wld:>11}  {row['forfeits']:>4}  {shots:>5}  {rate:>5}"
        )
    knockout = leaderboard.get("knockout")
    if knockout:
        for rnd in knockout["rounds"]:
            for m in rnd["matches"]:
                score = f"{m['wins_a']}-{m['wins_b']}" + (
                    f" ({m['draws']} draws)" if m["draws"] else ""
                )
                print(f"{rnd['name']:>12}: {m['a']} v {m['b']} {score} -> {m['winner']}")
        print(f"champion: {knockout['champion']}")
    for item in leaderboard.get("rejected", []):
        print(f"rejected {item['source']}: {item['error']}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="battleship-tournament", description="Run the Battleship Arena round-robin."
    )
    parser.add_argument("--root", type=Path, default=Path("."), help="repository root")
    parser.add_argument("--format", choices=FORMATS, default="league")
    parser.add_argument("--games", type=int, default=Config.games_per_pair, help="games per pair")
    parser.add_argument(
        "--knockout-games",
        type=int,
        default=Config.knockout_games,
        help="championship: games per knockout match",
    )
    parser.add_argument(
        "--top", type=int, default=Config.top, help="championship: players reaching the knockout"
    )
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--size", type=int, default=DEFAULT_SIZE)
    parser.add_argument("--fleet", type=_fleet, default=DEFAULT_FLEET)
    parser.add_argument("--time-budget", type=float, default=Config.time_budget)
    parser.add_argument("--build-budget", type=float, default=Config.build_budget)
    parser.add_argument("--jobs", type=int, default=Config.jobs, help="games run in parallel")
    parser.add_argument(
        "--no-subprocess",
        action="store_true",
        help="run games in-process (fast; cannot kill hung bots)",
    )
    parser.add_argument("--output", type=Path, help="default: <root>/results/leaderboard.json")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    reason = validate_fleet(args.size, list(args.fleet))
    if reason:
        parser.error(reason)
    if args.knockout_games < 1 or args.top < 2:
        parser.error("--knockout-games must be at least 1 and --top at least 2")
    if args.games < 1:
        parser.error("--games must be at least 1")
    for stream in (sys.stdout, sys.stderr):  # emoji icons on Windows consoles
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")

    rejected: list[dict[str, str]] = []
    players = load_players(default_manifests(args.root), rejected)
    if len(players) < 2:
        parser.error(f"need at least 2 players, found {len(players)}")
    config = Config(
        format=args.format,
        games_per_pair=args.games,
        knockout_games=args.knockout_games,
        top=args.top,
        seed=args.seed,
        size=args.size,
        fleet=tuple(args.fleet),
        time_budget=args.time_budget,
        build_budget=args.build_budget,
        subprocess=not args.no_subprocess,
        jobs=max(1, args.jobs),
    )

    def progress(done: int, total: int) -> None:
        if not args.quiet and sys.stderr.isatty():
            print(f"\rgame {done}/{total}", end="" if done < total else "\n", file=sys.stderr)

    leaderboard = run_tournament(players, config, progress)
    leaderboard["rejected"] = rejected
    leaderboard["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    output = args.output or args.root / "results" / "leaderboard.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(leaderboard, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    if not args.quiet:
        _print_table(leaderboard)
        print(f"wrote {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
