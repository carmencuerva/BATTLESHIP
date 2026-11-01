import json
import textwrap
import time

import pytest

from battleship.game import DEFAULT_FLEET, DEFAULT_SIZE, legal_shots
from battleship.player import Player
from battleship.registry import load_players, player_info
from battleship.tournament import (
    FORFEIT_BAD_PLACEMENT,
    FORFEIT_BUILD_ERROR,
    FORFEIT_BUILD_TIMEOUT,
    FORFEIT_ERROR,
    FORFEIT_ILLEGAL,
    FORFEIT_TIMEOUT,
    Config,
    bracket_size,
    main,
    next_games,
    run_game,
    run_game_in_subprocess,
    run_tournament,
    schedule,
    standings,
    total_games,
)
from battleship.tournament import _bracket as bracket


class Scanner(Player):
    """Deterministic, valid, quick: stacked fleet, shoots row by row."""

    @classmethod
    def get_name(cls):
        return "scanner"

    @classmethod
    def get_authors(cls):
        return ["test"]

    def choose_placement(self, board_size, fleet):
        return [[2 * i, 0, "H"] for i in range(len(fleet))]

    def choose_shot(self, view):
        return legal_shots(view)[0]


def variant(name, **methods):
    """A Scanner subclass called ``name`` with some methods replaced."""
    namespace = {"get_name": classmethod(lambda cls: name)}
    for key, fn in methods.items():
        namespace[key] = classmethod(fn) if key == "create" else fn
    return type(name.title(), (Scanner,), namespace)


def raise_(exc):
    raise exc


def sleep_then(seconds, value_fn):
    def method(self, *args):
        time.sleep(seconds)
        return value_fn(self, *args)

    return method


SPEC = {
    "size": DEFAULT_SIZE,
    "fleet": list(DEFAULT_FLEET),
    "seeds": [1, 2],
    "first": 0,
    "time_budget": 2.0,
    "build_budget": 2.0,
}


def spec(**changes):
    return {**SPEC, **changes}


# --- one game ----------------------------------------------------------------------------


@pytest.mark.parametrize("first", [0, 1])
def test_identical_scanners_first_shooter_wins(first):
    record = run_game([Scanner, Scanner], spec(first=first))
    assert record["winner"] == first
    assert record["first"] == first
    assert record["forfeits"] == []
    # Row-major scan: the last ship sits at (8, 0)-(8, 1), so the 82nd shot ends the game.
    assert record["shots"][first] == 8 * 10 + 2
    assert json.loads(json.dumps(record)) == record


def test_hits_are_counted():
    record = run_game([Scanner, Scanner], spec())
    assert record["hits"][0] == sum(DEFAULT_FLEET)
    assert 0 < record["hits"][1] < sum(DEFAULT_FLEET)


@pytest.mark.parametrize(
    "bad, reason",
    [
        (
            variant("boom", create=lambda cls, seed: raise_(RuntimeError("boom"))),
            FORFEIT_BUILD_ERROR,
        ),
        (variant("notplayer", create=lambda cls, seed: 42), FORFEIT_BUILD_ERROR),
        (variant("exit", create=lambda cls, seed: raise_(SystemExit(1))), FORFEIT_BUILD_ERROR),
        (
            variant("slowbuild", create=lambda cls, seed: time.sleep(0.2) or cls()),
            FORFEIT_BUILD_TIMEOUT,
        ),
        (
            variant("overlap", choose_placement=lambda self, n, f: [[0, 0, "H"]] * len(f)),
            FORFEIT_BAD_PLACEMENT,
        ),
        (
            variant("short", choose_placement=lambda self, n, f: [[0, 0, "H"]]),
            FORFEIT_BAD_PLACEMENT,
        ),
        (
            variant("objects", choose_placement=lambda self, n, f: [object()] * len(f)),
            FORFEIT_BAD_PLACEMENT,
        ),
        (
            variant("placeerr", choose_placement=lambda self, n, f: raise_(ValueError())),
            FORFEIT_ERROR,
        ),
        (variant("shooterr", choose_shot=lambda self, view: raise_(KeyError("x"))), FORFEIT_ERROR),
        (variant("offboard", choose_shot=lambda self, view: (10, 10)), FORFEIT_ILLEGAL),
        (variant("repeat", choose_shot=lambda self, view: (0, 0)), FORFEIT_ILLEGAL),
        (variant("garbage", choose_shot=lambda self, view: "a1"), FORFEIT_ILLEGAL),
        (variant("slowshot", choose_shot=sleep_then(0.05, Scanner.choose_shot)), FORFEIT_TIMEOUT),
    ],
)
@pytest.mark.parametrize("seat", [0, 1])
def test_faulty_bot_forfeits(bad, reason, seat):
    classes = [Scanner, Scanner]
    classes[seat] = bad
    # "repeat" only repeats from its second shot, so let the faulty bot shoot first.
    record = run_game(classes, spec(first=seat, build_budget=0.1, time_budget=0.1))
    assert record["winner"] == 1 - seat
    (forfeit,) = record["forfeits"]
    assert forfeit["player"] == seat and forfeit["reason"] == reason
    assert json.loads(json.dumps(record)) == record


def test_both_bad_placements_is_a_draw():
    bad = variant("overlap", choose_placement=lambda self, n, f: [[0, 0, "H"]] * len(f))
    record = run_game([bad, bad], spec())
    assert record["winner"] is None
    assert [f["player"] for f in record["forfeits"]] == [0, 1]


def test_bot_cannot_cheat_by_editing_its_view():
    def cheat(self, view):
        for row in view["cells"]:
            row[:] = [0] * len(row)
        return (0, 0)

    record = run_game([variant("cheat", choose_shot=cheat), Scanner], spec())
    assert record["forfeits"][0]["reason"] == FORFEIT_ILLEGAL


# --- subprocess: hung or dying bots ------------------------------------------------------

BOT_FILE = """
import os, time
from battleship.game import legal_shots
from battleship.player import Player

class Bot(Player):
    @classmethod
    def get_name(cls):
        return {name!r}

    @classmethod
    def get_authors(cls):
        return ["test"]

    def choose_placement(self, board_size, fleet):
        return [[2 * i, 0, "H"] for i in range(len(fleet))]

    def choose_shot(self, view):
        {body}
        return legal_shots(view)[0]
"""


def bots_on_disk(tmp_path, bodies):
    folder = tmp_path / "custom"
    folder.mkdir()
    lines = ["players:"]
    for name, body in bodies.items():
        (folder / f"{name}.py").write_text(
            textwrap.dedent(BOT_FILE).format(name=name, body=body), encoding="utf-8"
        )
        lines.append(f"  - {{file: {name}.py, class: Bot}}")
    (folder / "players.yaml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return load_players([folder / "players.yaml"])


def test_subprocess_runs_a_normal_game(tmp_path):
    a, b = bots_on_disk(tmp_path, {"alpha": "pass", "beta": "pass"})
    record = run_game_in_subprocess([a.entry, b.entry], spec(first=1))
    assert record == run_game([a.cls, b.cls], spec(first=1))


def test_subprocess_kills_a_hung_bot(tmp_path):
    hung, ok = bots_on_disk(tmp_path, {"hung": "time.sleep(60)", "ok": "pass"})
    start = time.perf_counter()
    record = run_game_in_subprocess([hung.entry, ok.entry], spec(time_budget=0.2))
    assert time.perf_counter() - start < 20
    assert record["winner"] == 1
    assert record["forfeits"][0]["reason"] == FORFEIT_TIMEOUT
    assert record["shots"] is None


def test_subprocess_survives_a_bot_that_kills_its_process(tmp_path):
    dead, ok = bots_on_disk(tmp_path, {"dead": "os._exit(3)", "ok": "pass"})
    record = run_game_in_subprocess([dead.entry, ok.entry], spec())
    assert record["winner"] == 1
    assert record["forfeits"][0]["reason"] == FORFEIT_ERROR
    assert "exit code 3" in record["forfeits"][0]["detail"]


# --- tournament ----------------------------------------------------------------------------


def infos(*classes):
    return [player_info(cls, "test") for cls in classes]


def test_schedule_mirrors_seeds_and_alternates_first():
    players = infos(Scanner, variant("other"), variant("third"))
    games = schedule(players, Config(games_per_pair=4))
    assert len(games) == 3 * 4
    series = [spec for i, j, spec in games if (i, j) == (0, 1)]
    assert [s["first"] for s in series] == [0, 1, 0, 1]
    assert series[0]["seeds"] == series[1]["seeds"] != series[2]["seeds"]


def test_schedule_of_a_pair_does_not_depend_on_other_players():
    a, b = infos(Scanner, variant("other"))
    alone = schedule([a, b], Config(games_per_pair=4))
    crowd = schedule([a, b, *infos(variant("zzz"))], Config(games_per_pair=4))
    assert [s for _, _, s in alone] == [s for i, j, s in crowd if (i, j) == (0, 1)]


def test_tournament_is_reproducible_and_seed_dependent(builtin_players):
    def run(seed):
        return run_tournament(
            builtin_players, Config(games_per_pair=4, seed=seed, subprocess=False)
        )

    first = run(1)
    assert first == run(1)
    assert first != run(2)
    assert json.loads(json.dumps(first)) == first


def test_faulty_bot_loses_and_tournament_goes_on():
    crasher = variant("crasher", choose_shot=lambda self, view: raise_(RuntimeError()))
    board = run_tournament(
        infos(Scanner, crasher, variant("other")), Config(games_per_pair=2, subprocess=False)
    )
    rows = {row["name"]: row for row in board["standings"]}
    assert rows["crasher"]["forfeits"] == 4
    assert rows["crasher"]["forfeit_reasons"] == {FORFEIT_ERROR: 4}
    assert rows["crasher"]["wins"] == 0
    assert board["standings"][-1]["name"] == "crasher"
    assert rows["scanner"]["played"] == rows["other"]["played"] == 4


def test_ranking_ties_break_on_forfeits():
    players = infos(variant("aa"), variant("bb"))
    games = schedule(players, Config(games_per_pair=2))
    forfeit = {"player": 0, "reason": FORFEIT_ERROR, "detail": ""}
    records = [
        {"first": 0, "winner": 1, "forfeits": [forfeit], "shots": [3, 3], "hits": [1, 1]},
        {"first": 1, "winner": 0, "forfeits": [], "shots": [20, 20], "hits": [17, 9]},
    ]
    board = standings(players, games, records, Config(format="simple"))
    assert [r["name"] for r in board["standings"]] == ["bb", "aa"]
    assert [r["points"] for r in board["standings"]] == [1, 1]


def test_ranking_ties_break_on_name():
    # Identical scanners: whoever shoots first wins, so everyone ends level.
    board = run_tournament(
        infos(variant("bb"), variant("aa"), Scanner),
        Config(format="simple", games_per_pair=2, subprocess=False),
    )
    assert [r["name"] for r in board["standings"]] == ["aa", "bb", "scanner"]
    assert all(r["points"] == 2 for r in board["standings"])
    assert all(r["wins_first"] == 2 and r["wins_second"] == 0 for r in board["standings"])


def test_metrics(builtin_players):
    board = run_tournament(builtin_players, Config(games_per_pair=6, subprocess=False))
    rows = {row["name"]: row for row in board["standings"]}
    assert board["standings"][0]["name"] == "hard"
    assert rows["hard"]["avg_shots_to_win"] < rows["medium"]["avg_shots_to_win"]
    assert 0 < rows["random"]["hit_rate"] < rows["hard"]["hit_rate"] < 1
    assert sum(r["elo"] for r in board["standings"]) == pytest.approx(1500 * len(rows), abs=0.5)
    for row in board["standings"]:
        assert row["wins"] == row["wins_first"] + row["wins_second"]
        assert row["played"] == row["wins"] + row["losses"] + row["draws"] == 3 * 6


def test_unknown_format_rejected():
    with pytest.raises(ValueError):
        run_tournament(infos(Scanner, variant("x")), Config(format="nope", subprocess=False))


# --- championship --------------------------------------------------------------------------


def test_bracket_helpers():
    assert bracket(2) == [0, 1]
    assert bracket(4) == [0, 3, 1, 2]  # 1st v 4th, 2nd v 3rd
    assert bracket(8) == [0, 7, 3, 4, 1, 6, 2, 5]
    assert [bracket_size(n, 4) for n in (2, 3, 4, 5, 9)] == [2, 2, 4, 4, 4]
    assert bracket_size(9, 8) == 8


def test_championship_stages_come_in_order():
    players = infos(*(variant(n) for n in ("aa", "bb", "cc", "dd", "ee")))
    config = Config(format="championship", games_per_pair=2, knockout_games=4, subprocess=False)
    played = []
    stages = []
    while (stage := next_games(players, config, played)) is not None:
        name, games = stage
        stages.append((name, len(games)))
        played += [
            (i, j, spec, run_game([players[i].cls, players[j].cls], spec)) for i, j, spec in games
        ]
    assert stages == [("league", 10 * 2), ("semifinal", 2 * 4), ("final", 4)]
    assert len(played) == total_games(players, config)


def test_drawn_series_goes_to_the_better_league_position():
    # Identical scanners: the first shooter always wins, so every series is drawn.
    board = run_tournament(
        infos(*(variant(n) for n in ("dd", "cc", "bb", "aa"))),
        Config(format="championship", games_per_pair=2, knockout_games=2, subprocess=False),
    )
    league = {r["name"]: r["league_rank"] for r in board["standings"]}
    for rnd in board["knockout"]["rounds"]:
        for m in rnd["matches"]:
            assert m["wins_a"] == m["wins_b"] == 1
            assert m["winner"] == min(m["a"], m["b"], key=league.get)
    first = min(league, key=league.get)
    assert board["knockout"]["champion"] == board["standings"][0]["name"] == first


def test_championship_with_builtins(builtin_players):
    config = Config(format="championship", games_per_pair=4, knockout_games=4, subprocess=False)
    board = run_tournament(builtin_players, config)
    knockout = board["knockout"]
    assert [r["name"] for r in knockout["rounds"]] == ["semifinal", "final"]
    by_league = {r["league_rank"]: r["name"] for r in board["standings"]}
    semis = knockout["rounds"][0]["matches"]
    assert {(m["a"], m["b"]) for m in semis} == {
        (by_league[1], by_league[4]),
        (by_league[2], by_league[3]),
    }
    assert board["standings"][0]["name"] == knockout["champion"]
    assert board["config"]["knockout_games"] == 4
    assert json.loads(json.dumps(board)) == board

    # The league part is the same games as a plain league with the same seed.
    league = run_tournament(builtin_players, Config(games_per_pair=4, subprocess=False))
    elo = {r["name"]: r["elo"] for r in league["standings"]}
    assert {r["name"]: r["elo"] for r in board["standings"]} == elo
    assert "knockout_games" not in league["config"]


# --- command line --------------------------------------------------------------------------


def test_cli_writes_leaderboard(tmp_path, capsys):
    from .conftest import ROOT

    output = tmp_path / "board.json"
    code = main(["--root", str(ROOT), "--games", "2", "--no-subprocess", "--output", str(output)])
    assert code == 0
    board = json.loads(output.read_text(encoding="utf-8"))
    assert {r["name"] for r in board["standings"]} >= {"random", "easy", "medium", "hard"}
    assert board["rejected"] == [] and "generated_at" in board
    assert "hard" in capsys.readouterr().out


def test_cli_championship(tmp_path, capsys):
    from .conftest import ROOT

    output = tmp_path / "board.json"
    args = ["--root", str(ROOT), "--format", "championship", "--games", "2"]
    args += ["--knockout-games", "2", "--no-subprocess", "--output", str(output)]
    assert main(args) == 0
    board = json.loads(output.read_text(encoding="utf-8"))
    assert board["knockout"]["champion"] == board["standings"][0]["name"]
    assert "champion:" in capsys.readouterr().out


def test_cli_rejects_impossible_fleet(tmp_path):
    with pytest.raises(SystemExit):
        main(["--size", "3", "--fleet", "3,3,3", "--output", str(tmp_path / "x.json")])
