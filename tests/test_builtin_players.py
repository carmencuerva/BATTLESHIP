import json

import pytest

from battleship.game import (
    DEFAULT_FLEET,
    DEFAULT_SIZE,
    is_valid_placement,
    new_board,
    view_for_attacker,
)

from .conftest import shots_to_sink


def by_name(players, name):
    return next(p for p in players if p.name == name).cls


@pytest.mark.parametrize("seed", range(10))
def test_placements_are_legal(builtin_players, seed):
    for info in builtin_players:
        placement = info.cls.create(seed).choose_placement(DEFAULT_SIZE, list(DEFAULT_FLEET))
        assert is_valid_placement(DEFAULT_SIZE, DEFAULT_FLEET, placement), info.name
        assert json.loads(json.dumps(placement)) == placement


def test_placements_on_custom_config(builtin_players):
    for info in builtin_players:
        placement = info.cls.create(0).choose_placement(6, [3, 2, 2, 1])
        assert is_valid_placement(6, [3, 2, 2, 1], placement), info.name


def test_same_seed_same_behaviour(builtin_players):
    for info in builtin_players:
        a, b = info.cls.create(7), info.cls.create(7)
        assert a.choose_placement(DEFAULT_SIZE, DEFAULT_FLEET) == b.choose_placement(
            DEFAULT_SIZE, DEFAULT_FLEET
        )
        assert shots_to_sink(a, seed=1) == shots_to_sink(b, seed=1)


@pytest.mark.parametrize("seed", range(5))
def test_every_shot_is_legal_until_the_fleet_sinks(builtin_players, seed):
    for info in builtin_players:
        shots = shots_to_sink(info.cls.create(seed), seed)
        assert sum(DEFAULT_FLEET) <= shots <= DEFAULT_SIZE**2


def test_shots_are_json_friendly(builtin_players):
    board = new_board(DEFAULT_SIZE, DEFAULT_FLEET, [[2 * i, 0, "H"] for i in range(5)])
    view = view_for_attacker(board)
    for info in builtin_players:
        shot = info.cls.create(0).choose_shot(view)
        assert json.loads(json.dumps(shot)) == list(shot)


def test_easy_scans_row_by_row(builtin_players):
    easy = by_name(builtin_players, "easy").create(0)
    view = view_for_attacker(
        new_board(DEFAULT_SIZE, DEFAULT_FLEET, [[2 * i, 0, "H"] for i in range(5)])
    )
    assert easy.choose_shot(view) == (0, 0)
    view["cells"][0] = [1] * DEFAULT_SIZE
    view["cells"][1][0] = 1
    assert easy.choose_shot(view) == (1, 1)
