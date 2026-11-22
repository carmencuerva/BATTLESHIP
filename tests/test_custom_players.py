import json
import statistics
import sys

import pytest

from battleship.bots import certain_water, probability_map
from battleship.game import DEFAULT_FLEET, DEFAULT_SIZE, is_valid_placement
from battleship.registry import default_manifests, load_players
from battleship.tournament import run_game

from .conftest import ROOT, shots_to_sink
from .test_strategies import EMPTY, make_view

CUSTOM = load_players(default_manifests(ROOT)[1:])
SPEC = {"size": 10, "fleet": list(DEFAULT_FLEET), "time_budget": 2.0, "build_budget": 2.0}


def by_name(name):
    return next(p for p in load_players(default_manifests(ROOT)) if p.name == name)


@pytest.mark.parametrize("player", CUSTOM, ids=lambda p: p.name)
def test_custom_player_plays_clean_games(player):
    random_bot = by_name("random")
    for seed in range(6):
        spec = {**SPEC, "seeds": [seed, seed + 100], "first": seed % 2}
        record = run_game([player.cls, random_bot.cls], spec)
        assert record["forfeits"] == [], record["forfeits"]


@pytest.mark.parametrize("player", CUSTOM, ids=lambda p: p.name)
def test_custom_player_places_legally_on_other_boards(player):
    for size, fleet in [(DEFAULT_SIZE, list(DEFAULT_FLEET)), (7, [3, 2, 2]), (12, [6, 5, 4, 3])]:
        placement = player.cls.create(1).choose_placement(size, fleet)
        assert is_valid_placement(size, fleet, placement)


# --- car_lu --------------------------------------------------------------------------------


def car_lu():
    return by_name("car_lu").cls.create(0)


def test_car_lu_never_shoots_certain_water():
    # Sunk ship on row 0; a hit at (4, 4). Its diagonals and the sunk ship's halo are water.
    view = make_view(
        ["##........", "..........", "..........", "..........", "....X....."] + ["." * 10] * 5,
        [5, 4, 3],
    )
    bot = car_lu()
    water = certain_water(view)
    assert {(1, 0), (1, 1), (1, 2), (0, 2), (3, 3), (5, 5)} <= water
    for _ in range(20):
        shot = bot.choose_shot(view)
        assert shot not in water
        assert shot in {(3, 4), (5, 4), (4, 3), (4, 5)}  # finishes the hit first


def test_car_lu_extends_a_line_of_hits():
    view = make_view([".....", ".XX..", ".....", ".....", "....."], [3])
    assert car_lu().choose_shot(view) in {(1, 0), (1, 3)}


def car_lu_module():
    return sys.modules[by_name("car_lu").cls.__module__]


def test_car_lu_without_hiding_belief_counts_like_hard():
    """With belief 0 every position weighs 1: the very same map as hard's."""
    heat, _ = car_lu_module().heat_map(EMPTY, 0.0)
    expected = probability_map(EMPTY)
    assert [round(x, 6) for x in heat] == [x for row in expected for x in row]


def test_car_lu_hiding_model_looks_at_the_edges_first():
    module = car_lu_module()
    heat, _ = module.heat_map(EMPTY, 1.0)
    edge = max(heat[r * 10 + c] for r in range(10) for c in range(10) if r in (0, 9))
    middle = max(heat[r * 10 + c] for r in range(3, 7) for c in range(3, 7))
    assert edge > middle


def test_car_lu_models_any_board():
    """Both hypotheses are built from the board itself, not from 10x10 constants."""
    module = car_lu_module()
    for size, fleet in [(7, [3, 2, 2]), (12, [6, 5, 4, 3, 3, 2]), (15, [5, 4, 4, 3, 2])]:
        view = make_view(["." * size] * size, fleet)
        assert module.hiding_belief(view) == module.PRIOR_HIDING
        heat, _ = module.heat_map(view, 0.5)
        assert len(heat) == size * size and min(heat) > 0


def test_car_lu_learns_how_the_rival_hides():
    module = car_lu_module()
    # ship cells on the border and water in the middle: the rival hides
    hiding = make_view(
        ["XX........"] + [".........."] * 3 + ["....oo...."] * 2 + [".........."] * 4,
        list(DEFAULT_FLEET),
    )
    # ship cells in the middle and water on the border: the rival places evenly
    even = make_view(
        ["oo........"] + [".........."] * 3 + ["....XX...."] + [".........."] * 5,
        list(DEFAULT_FLEET),
    )
    assert module.hiding_belief(hiding) > module.PRIOR_HIDING > module.hiding_belief(even)


def test_car_lu_knows_the_whole_fleet_from_the_view():
    rows = ["###......."] + ["." * 10] * 7 + ["#.........", "#........."]
    view = make_view(rows, [5, 4, 3])  # a sunk 3 and a sunk 2
    assert car_lu_module().whole_fleet(view) == [5, 4, 3, 3, 2]


def test_car_lu_shares_its_map():
    bot = car_lu()
    first = bot.choose_shot(EMPTY)
    assert EMPTY["cells"][first[0]][first[1]] == 0
    assert json.loads(json.dumps(bot.last_info)) == bot.last_info
    assert len(bot.last_info["heatmap"]) == 10
    assert bot.last_info["hiding"] == car_lu_module().PRIOR_HIDING


def test_car_lu_is_stronger_than_medium():
    games = 40
    mean = {
        name: statistics.mean(
            shots_to_sink(by_name(name).cls.create(s), 9000 + s) for s in range(games)
        )
        for name in ("medium", "car_lu")
    }
    assert mean["car_lu"] + 4 < mean["medium"]
