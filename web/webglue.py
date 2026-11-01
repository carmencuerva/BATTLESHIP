"""Thin bridge between the web UI (JavaScript) and the Python engine and players.

Every public function takes JSON strings and returns a JSON string: nothing but plain data
crosses the Python <-> JS boundary. The rules live in ``battleship.game``; this module
only exposes them. Players live here, in Python, behind integer handles, because they are
objects with state (their random generators, their memory).

Live games have no time budgets (best effort): a bot that raises simply forfeits.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from battleship import game, tournament
from battleship.player import Player
from battleship.registry import PlayerInfo, default_manifests, load_players

# Inside py.zip, players/ sits next to this file; in the repository it is one level up.
ROOT = Path(__file__).resolve().parent
if not (ROOT / "players").is_dir():
    ROOT = ROOT.parent

_infos: dict[str, PlayerInfo] = {}
_bots: dict[int, Player] = {}
_next_handle = 1

# The browser cannot kill a hung bot and Python runs slower there, so budgets are generous.
WEB_TIME_BUDGET = 30.0
WEB_BUILD_BUDGET = 10.0


def _out(value: Any) -> str:
    return json.dumps(value)


def _in(text: str) -> Any:
    return json.loads(text)


# --- configuration and players -------------------------------------------------------------


def defaults() -> str:
    """``{"size", "fleet"}`` used by the arena."""
    return _out({"size": game.DEFAULT_SIZE, "fleet": list(game.DEFAULT_FLEET)})


def _fleet_problem(size: Any, fleet: Any) -> str | None:
    reason = game.validate_fleet(size, fleet)
    if not reason:
        try:
            game.random_placement(size, fleet, random.Random(0), max_attempts=200)
        except ValueError as exc:
            reason = str(exc)
    return reason


def check_fleet(size: str, fleet: str) -> str:
    """``{"ok", "reason"}`` for a custom board size and fleet (tries a real placement)."""
    reason = _fleet_problem(_in(size), _in(fleet))
    return _out({"ok": reason is None, "reason": reason})


def list_players() -> str:
    """Identity of every admitted player (builtin first), loading them on first use."""
    rejected: list[dict[str, str]] = []
    players = load_players(default_manifests(ROOT), rejected)
    _infos.clear()
    _infos.update({p.name: p for p in players})
    return _out({"players": [p.to_json() for p in players], "rejected": rejected})


def _info(name: str) -> PlayerInfo | None:
    if not _infos:
        list_players()
    return _infos.get(name)


def create_bot(name: str, seed: str) -> str:
    """``{"handle"}`` of a new bot, or ``{"error"}`` if it cannot be built."""
    global _next_handle
    info = _info(_in(name))
    if info is None:
        return _out({"error": f"unknown player {_in(name)!r}"})
    try:
        bot = info.cls.create(_in(seed))
        if not isinstance(bot, Player):
            raise TypeError(f"create() returned {type(bot).__name__}")
    except Exception as exc:
        return _out({"error": f"create: {exc!r}"})
    handle, _next_handle = _next_handle, _next_handle + 1
    _bots[handle] = bot
    return _out({"handle": handle})


def release_bot(handle: str) -> str:
    _bots.pop(_in(handle), None)
    return _out(None)


def bot_placement(handle: str, size: str, fleet: str) -> str:
    """``{"placement"}`` chosen by the bot, or ``{"error"}`` (bad placements included)."""
    size_, fleet_ = _in(size), _in(fleet)
    try:
        placement = json.loads(json.dumps(_bots[_in(handle)].choose_placement(size_, fleet_)))
    except Exception as exc:
        return _out({"error": f"choose_placement: {exc!r}"})
    reason = game.validate_placement(size_, fleet_, placement)
    if reason:
        return _out({"error": f"bad placement: {reason}"})
    return _out({"placement": placement})


def bot_shot(handle: str, view: str) -> str:
    """``{"shot", "info"}`` (``info`` is the bot's optional ``last_info``), or ``{"error"}``."""
    view_ = _in(view)
    bot = _bots[_in(handle)]
    try:
        shot = bot.choose_shot(json.loads(json.dumps(view_)))
        info = json.loads(json.dumps(bot.last_info))
    except Exception as exc:
        return _out({"error": f"choose_shot: {exc!r}"})
    if not game.is_legal_shot(view_, shot):
        return _out({"error": f"illegal shot {shot!r}"})
    return _out({"shot": list(shot), "info": info})


# --- placement editor ----------------------------------------------------------------------


def layout(size: str, fleet: str, placement: str) -> str:
    """Check a partial placement (``null`` for ships not placed yet).

    Returns ``{"ships": [cells | null], "ok", "reason", "complete"}``; ``ok`` judges only
    the ships placed so far, so the editor can colour a hover preview.
    """
    size_, fleet_, placement_ = _in(size), _in(fleet), _in(placement)
    placed = [i for i, entry in enumerate(placement_) if entry is not None]
    sub_fleet = [fleet_[i] for i in placed]
    sub_placement = [placement_[i] for i in placed]
    reason = game.validate_placement(size_, sub_fleet, sub_placement)
    ships: list[Any] = [None] * len(fleet_)
    for i in placed:
        row, col, orientation = placement_[i]
        cells = game.ship_cells(row, col, fleet_[i], orientation)
        ships[i] = [list(c) for c in cells if game.in_bounds(size_, c)]
    return _out(
        {
            "ships": ships,
            "ok": reason is None,
            "reason": reason,
            "complete": reason is None and len(placed) == len(fleet_),
        }
    )


def random_layout(size: str, fleet: str, seed: str) -> str:
    """A random legal placement."""
    return _out(game.random_placement(_in(size), _in(fleet), random.Random(_in(seed))))


# --- playing -------------------------------------------------------------------------------


def new_board(size: str, fleet: str, placement: str) -> str:
    return _out(game.new_board(_in(size), _in(fleet), _in(placement)))


def _hints(view: game.View) -> list[list[int]]:
    """Unshot cells that must be water: around sunk ships and diagonal to any hit."""
    size, cells = view["size"], view["cells"]
    hints = [[0] * size for _ in range(size)]
    for r in range(size):
        for c in range(size):
            if cells[r][c] == game.SUNK:
                around = game.neighbours(size, (r, c))
            elif cells[r][c] == game.HIT:
                around = [(r + dr, c + dc) for dr in (-1, 1) for dc in (-1, 1)]
            else:
                continue
            for x, y in around:
                if game.in_bounds(size, (x, y)) and cells[x][y] == game.UNKNOWN:
                    hints[x][y] = 1
    return hints


def status(board: str) -> str:
    """Everything the UI draws for one board.

    ``view`` is what the attacker sees, ``hints`` marks certain water for the attacker,
    ``fleet`` lists ship cells (for the owner's own board or the end-of-game reveal),
    ``sunk`` lists the cells of every sunk ship (public knowledge: the attacker may draw
    them), ``terminal`` is True once every ship is sunk.
    """
    board_ = _in(board)
    view = game.view_for_attacker(board_)
    cells = view["cells"]
    sunk = [ship for ship in board_["ships"] if all(cells[r][c] == game.SUNK for r, c in ship)]
    return _out(
        {
            "view": view,
            "hints": _hints(view),
            "fleet": board_["ships"],
            "sunk": sunk,
            "terminal": game.is_terminal(board_),
        }
    )


def is_legal_shot(view: str, shot: str) -> str:
    return _out(game.is_legal_shot(_in(view), _in(shot)))


def shoot(board: str, shot: str, attacker: str) -> str:
    """Fire ``shot`` at ``board``.

    Returns ``{"board", "result", "terminal", "next"}`` where ``next`` is who shoots next
    (``attacker`` again after a hit or sink), or ``{"error"}`` for an illegal shot.
    """
    try:
        new, result = game.apply_shot(_in(board), _in(shot))
    except ValueError as exc:
        return _out({"error": str(exc)})
    return _out(
        {
            "board": new,
            "result": result,
            "terminal": game.is_terminal(new),
            "next": game.next_attacker(_in(attacker), result),
        }
    )


# --- tournament ------------------------------------------------------------------------------
# The same stages, game loop and standings as the CI tournament (battleship.tournament).
# The page asks for the next games, plays them one at a time (redrawing in between) and
# sends back everything played so far: Python decides every stage, JS only loops.


def _config(config: dict[str, Any]) -> tournament.Config:
    return tournament.Config(
        format=config.get("format", "league"),
        games_per_pair=config["games_per_pair"],
        knockout_games=config.get("knockout_games", tournament.Config.knockout_games),
        top=config.get("top", tournament.Config.top),
        seed=config.get("seed", 0),
        size=config.get("size", game.DEFAULT_SIZE),
        fleet=tuple(config.get("fleet", game.DEFAULT_FLEET)),
        time_budget=WEB_TIME_BUDGET,
        build_budget=WEB_BUILD_BUDGET,
        subprocess=False,
        jobs=1,
    )


def _entrants(names: list[str]) -> list[PlayerInfo]:
    infos = []
    for name in sorted(set(names)):
        info = _info(name)
        if info is None:
            raise ValueError(f"unknown player {name!r}")
        infos.append(info)
    return infos


def _setup(config: dict[str, Any]) -> tuple[list[PlayerInfo], tournament.Config]:
    """Validated entrants (in table order) and settings; raises ValueError."""
    try:
        entrants = _entrants(config["players"])
        settings = _config(config)
    except (KeyError, TypeError) as exc:
        raise ValueError(f"bad tournament config: {exc!r}") from None
    if len(entrants) < 2:
        raise ValueError("pick at least 2 players")
    if settings.format not in tournament.FORMATS:
        raise ValueError(f"unknown format {settings.format!r}")
    reason = _fleet_problem(settings.size, list(settings.fleet))
    if reason:
        raise ValueError(reason)
    if settings.games_per_pair < 1 or settings.knockout_games < 1:
        raise ValueError("games per pair and per knockout match must be at least 1")
    return entrants, settings


def _played(played: Any) -> list[tournament.Played]:
    return [(i, j, spec, record) for i, j, spec, record in played]


def tournament_next(config: str, played: str) -> str:
    """The games still to play in the current stage.

    ``config`` holds ``players`` (names), ``games_per_pair`` and optionally ``format``
    ("league", "simple" or "championship"), ``knockout_games``, ``top``, ``seed``, ``size``
    and ``fleet``. ``played`` is every game so far as ``[i, j, spec, record]``.

    Returns ``{"players": [names in table order], "stage", "games": [[i, j, spec], ...],
    "total"}``, ``{"done": true, "total"}`` when the tournament is over, or ``{"error"}``.
    """
    try:
        entrants, settings = _setup(_in(config))
    except ValueError as exc:
        return _out({"error": str(exc)})
    total = tournament.total_games(entrants, settings)
    stage = tournament.next_games(entrants, settings, _played(_in(played)))
    if stage is None:
        return _out({"done": True, "total": total})
    name, games = stage
    return _out(
        {
            "players": [p.name for p in entrants],
            "stage": name,
            "games": [list(g) for g in games],
            "total": total,
        }
    )


def tournament_game(names: str, spec: str) -> str:
    """Play one scheduled game in-process; returns the game record (see ``run_game``)."""
    names_ = _in(names)
    classes = []
    for name in names_:
        info = _info(name)
        if info is None:
            return _out({"error": f"unknown player {name!r}"})
        classes.append(info.cls)
    return _out(tournament.run_game(classes, _in(spec)))


def tournament_result(config: str, played: str) -> str:
    """The leaderboard (same shape as ``results/leaderboard.json``) once it is all played."""
    entrants, settings = _setup(_in(config))
    return _out(tournament.final_leaderboard(entrants, settings, _played(_in(played))))
