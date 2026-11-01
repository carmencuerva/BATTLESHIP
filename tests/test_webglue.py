import inspect
import json
import random
import sys

import pytest

from battleship.game import DEFAULT_FLEET, DEFAULT_SIZE, HIT, SUNK, UNKNOWN

from .conftest import ROOT

sys.path.insert(0, str(ROOT / "web"))
import webglue  # noqa: E402

STACKED = [[2 * i, 0, "H"] for i in range(5)]


def call(name, *args):
    """Call like the browser does: JSON strings in, a JSON string out."""
    out = getattr(webglue, name)(*(json.dumps(a) for a in args))
    assert isinstance(out, str)
    return json.loads(out)


def public_functions():
    return [
        name
        for name, fn in inspect.getmembers(webglue, inspect.isfunction)
        if fn.__module__ == "webglue" and not name.startswith("_")
    ]


def test_every_public_function_takes_and_returns_strings():
    for name in public_functions():
        hints = inspect.get_annotations(getattr(webglue, name))
        assert hints.pop("return") == "str", name
        assert all(h == "str" for h in hints.values()), name


def test_defaults_and_players():
    assert call("defaults") == {"size": DEFAULT_SIZE, "fleet": list(DEFAULT_FLEET)}
    listed = call("list_players")
    assert [p["name"] for p in listed["players"]][:4] == ["random", "easy", "medium", "hard"]
    assert listed["rejected"] == []


def test_check_fleet():
    assert call("check_fleet", 10, [5, 4, 3, 3, 2]) == {"ok": True, "reason": None}
    assert call("check_fleet", 3, [3, 3, 3])["ok"] is False
    assert call("check_fleet", 2, [1, 1])["ok"] is False  # passes the bound, cannot fit


def test_bots_through_handles():
    assert "error" in call("create_bot", "nobody", 1)
    handle = call("create_bot", "hard", 1)["handle"]
    placement = call("bot_placement", handle, 10, list(DEFAULT_FLEET))["placement"]
    board = call("new_board", 10, list(DEFAULT_FLEET), placement)
    view = call("status", board)["view"]
    shot = call("bot_shot", handle, view)
    assert view["cells"][shot["shot"][0]][shot["shot"][1]] == UNKNOWN
    assert len(shot["info"]["heatmap"]) == 10
    call("release_bot", handle)
    assert handle not in webglue._bots


def test_layout_of_partial_placements():
    fleet = list(DEFAULT_FLEET)
    empty = call("layout", 10, fleet, [None] * 5)
    assert empty == {"ships": [None] * 5, "ok": True, "reason": None, "complete": False}
    one = call("layout", 10, fleet, [[0, 0, "H"], None, None, None, None])
    assert one["ships"][0] == [[0, c] for c in range(5)] and one["ok"]
    touching = call("layout", 10, fleet, [[0, 0, "H"], [1, 0, "H"], None, None, None])
    assert not touching["ok"] and "touches" in touching["reason"]
    off = call("layout", 10, fleet, [[0, 8, "H"], None, None, None, None])
    assert not off["ok"] and off["ships"][0] == [[0, 8], [0, 9]]
    assert call("layout", 10, fleet, STACKED)["complete"] is True


def test_random_layout_is_legal():
    placement = call("random_layout", 10, list(DEFAULT_FLEET), 3)
    assert call("layout", 10, list(DEFAULT_FLEET), placement)["complete"]


def test_shoot_reports_next_attacker_and_errors():
    board = call("new_board", 10, list(DEFAULT_FLEET), STACKED)
    miss = call("shoot", board, [9, 9], 0)
    assert miss["result"]["outcome"] == "miss" and miss["next"] == 1
    hit = call("shoot", miss["board"], [0, 0], 1)
    assert hit["result"]["outcome"] == "hit" and hit["next"] == 1
    assert "error" in call("shoot", hit["board"], [0, 0], 1)
    assert "error" in call("shoot", hit["board"], [10, 0], 1)


def test_status_hints_mark_certain_water():
    board = call("new_board", 10, list(DEFAULT_FLEET), STACKED)
    for shot in ([8, 0], [8, 1], [0, 2]):  # sink the 2-ship, hit the 5-ship
        board = call("shoot", board, shot, 0)["board"]
    status = call("status", board)
    view, hints = status["view"], status["hints"]
    assert view["cells"][8][0] == SUNK and view["cells"][0][2] == HIT
    for r, c in [(7, 0), (7, 2), (9, 1), (8, 2)]:  # around the sunk ship
        assert hints[r][c] == 1
    for r, c in [(1, 1), (1, 3)]:  # diagonal to the hit
        assert hints[r][c] == 1
    assert hints[0][3] == 0 and hints[1][2] == 0  # in line with the hit: could be ship
    assert status["terminal"] is False


def test_full_human_vs_bot_game_through_the_glue():
    rng = random.Random(0)
    fleet = list(DEFAULT_FLEET)
    handle = call("create_bot", "medium", 5)["handle"]
    boards = [
        call("new_board", 10, fleet, call("random_layout", 10, fleet, 1)),
        call("new_board", 10, fleet, call("bot_placement", handle, 10, fleet)["placement"]),
    ]
    attacker = 0
    for _ in range(400):
        defender = 1 - attacker
        view = call("status", boards[defender])["view"]
        if attacker == 0:
            unknown = [[r, c] for r in range(10) for c in range(10) if view["cells"][r][c] == 0]
            shot = rng.choice(unknown)
        else:
            shot = call("bot_shot", handle, view)["shot"]
        out = call("shoot", boards[defender], shot, attacker)
        boards[defender] = out["board"]
        if out["terminal"]:
            break
        attacker = out["next"]
    else:
        pytest.fail("game did not end")
    assert call("status", boards[1 - attacker])["terminal"]
