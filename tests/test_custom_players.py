import json
import statistics

import pytest

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


# --- lucia --------------------------------------------------------------------------------


def lucia():
    return by_name("lucia").cls.create(0)


def test_lucia_never_shoots_certain_water():
    # Sunk ship on row 0; a hit at (4, 4). Its diagonals and the sunk ship's halo are water.
    view = make_view(
        ["##........", "..........", "..........", "..........", "....X....."] + ["." * 10] * 5,
        [5, 4, 3],
    )
    bot = lucia()
    water = bot.certain_water(view)
    assert {(1, 0), (1, 1), (1, 2), (0, 2), (3, 3), (5, 5)} <= water
    for _ in range(20):
        shot = bot.choose_shot(view)
        assert shot in {(3, 4), (5, 4), (4, 3), (4, 5)}  # finishes the hit first


def test_lucia_extends_a_line_of_hits():
    view = make_view([".....", ".XX..", ".....", ".....", "....."], [3])
    assert lucia().choose_shot(view) in {(1, 0), (1, 3)}


def test_lucia_hunts_away_from_earlier_shots_and_shares_its_map():
    bot = lucia()
    first = bot.choose_shot(EMPTY)
    assert first in {(4, 4), (5, 5)}  # the centre, on the parity grid of the 2-ship
    assert json.loads(json.dumps(bot.last_info)) == bot.last_info
    assert len(bot.last_info["heatmap"]) == 10


def test_lucia_is_stronger_than_medium():
    games = 40
    mean = {
        name: statistics.mean(
            shots_to_sink(by_name(name).cls.create(s), 9000 + s) for s in range(games)
        )
        for name in ("medium", "lucia")
    }
    assert mean["lucia"] + 4 < mean["medium"]
