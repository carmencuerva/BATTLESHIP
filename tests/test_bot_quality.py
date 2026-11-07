"""Quality of every admitted bot (built-in and submitted), checked in real games.

- legality: no bot ever shoots off the board or at a cell it already shot;
- placement: always legal (inside, no overlap, no contact), and not a fixed pattern;
- ladder: random/easy < medium < hard, and lucia beats hard (marked slow);
- reproducibility: the same seeds give the same game and the same tournament;
- hidden information: no view handed to a bot reveals a ship cell it has not shot.
"""

import copy
import random

import pytest

from battleship.game import (
    DEFAULT_FLEET,
    DEFAULT_SIZE,
    HIT,
    MISS,
    SUNK,
    UNKNOWN,
    validate_placement,
)
from battleship.player import Player
from battleship.registry import default_manifests, load_players
from battleship.tournament import Config, run_game, run_tournament, schedule

from .conftest import ROOT, shots_to_sink

PLAYERS = load_players(default_manifests(ROOT))
BY_NAME = {p.name: p for p in PLAYERS}
CONFIGS = [(DEFAULT_SIZE, list(DEFAULT_FLEET)), (7, [3, 2, 2]), (12, [6, 5, 4, 3])]


def spec(seeds, first=0, size=DEFAULT_SIZE, fleet=DEFAULT_FLEET):
    return {
        "size": size,
        "fleet": list(fleet),
        "seeds": list(seeds),
        "first": first,
        "time_budget": 10.0,  # legality, not speed, is under test here (the CI may be busy)
        "build_budget": 10.0,
    }


def series(a, b, games, seed):
    """The tournament's own mirrored games between players ``a`` and ``b``."""
    pair = [BY_NAME[a], BY_NAME[b]]
    return [s for _, _, s in schedule(pair, Config(games_per_pair=games, seed=seed))]


# --- legality --------------------------------------------------------------------------


@pytest.mark.parametrize("player", PLAYERS, ids=lambda p: p.name)
def test_never_shoots_off_the_board_or_twice(player):
    """Shot by shot, on three board sizes and many fleets (shots_to_sink checks each one)."""
    for size, fleet in CONFIGS:
        for seed in range(8):
            shots = shots_to_sink(player.cls.create(seed), 500 + seed, size, fleet)
            assert sum(fleet) <= shots <= size * size


@pytest.mark.parametrize("player", PLAYERS, ids=lambda p: p.name)
def test_plays_whole_games_against_everyone_without_forfeits(player):
    for other in PLAYERS:
        for k, seeds in enumerate([(1, 2), (3, 4)]):
            record = run_game([player.cls, other.cls], spec(seeds, first=k))
            assert record["forfeits"] == [], (player.name, other.name, record["forfeits"])


# --- placement -------------------------------------------------------------------------


@pytest.mark.parametrize("player", PLAYERS, ids=lambda p: p.name)
def test_placements_are_legal_on_every_board(player):
    for size, fleet in CONFIGS:
        for seed in range(25):
            placement = player.cls.create(seed).choose_placement(size, list(fleet))
            assert validate_placement(size, fleet, placement) is None, (size, seed, placement)


@pytest.mark.parametrize("player", PLAYERS, ids=lambda p: p.name)
def test_placements_are_not_a_fixed_pattern(player):
    """Varied from seed to seed, both orientations used, not everything on the edges."""
    size, fleet = DEFAULT_SIZE, list(DEFAULT_FLEET)
    placements = [player.cls.create(seed).choose_placement(size, fleet) for seed in range(40)]
    distinct = {repr(p) for p in placements}
    assert len(distinct) >= 35
    orientations = {entry[2] for p in placements for entry in p}
    assert orientations == {"H", "V"}
    cells = [
        (r + (k if o == "V" else 0), c + (k if o == "H" else 0))
        for p in placements
        for length, (r, c, o) in zip(fleet, p, strict=True)
        for k in range(length)
    ]
    on_border = sum(1 for r, c in cells if r in (0, size - 1) or c in (0, size - 1))
    assert on_border / len(cells) < 0.75


# --- the ladder ------------------------------------------------------------------------


def wins(a, b, games, seed=2026):
    """Games ``a`` wins against ``b`` in the tournament's mirrored series."""
    total = 0
    for s in series(a, b, games, seed):
        record = run_game([BY_NAME[a].cls, BY_NAME[b].cls], {**s, "time_budget": 10.0})
        assert record["forfeits"] == []
        total += record["winner"] == 0
    return total


@pytest.mark.slow
def test_ladder_in_real_games():
    """Fixed seeds, so the result never changes unless a bot does. Measured over 1,000
    games per pair (seed 0): medium beats easy 1000-0, hard beats medium about 76%, lucia
    beats hard about 68%; the thresholds leave room for small changes."""
    assert wins("medium", "easy", 20) >= 18
    assert wins("hard", "medium", 40) >= 26
    assert wins("lucia", "hard", 100) >= 56


# --- reproducibility -------------------------------------------------------------------


@pytest.mark.parametrize("player", PLAYERS, ids=lambda p: p.name)
def test_same_seeds_same_game(player):
    for other in ("random", "hard"):
        game = spec((11, 12))
        first = run_game([player.cls, BY_NAME[other].cls], game)
        again = run_game([player.cls, BY_NAME[other].cls], game)
        assert first == again


def test_same_seed_same_tournament():
    config = Config(games_per_pair=2, seed=7, subprocess=False)
    first = run_tournament(PLAYERS, config)
    again = run_tournament(PLAYERS, config)
    assert first == again


# --- hidden information ----------------------------------------------------------------


class Spy(Player):
    """Shoots in reading order and checks every view it is given against its own shots."""

    seen: list[dict] = []

    @classmethod
    def get_name(cls):
        return "spy"

    @classmethod
    def get_authors(cls):
        return ["tests"]

    @classmethod
    def create(cls, seed):
        return cls()

    def __init__(self):
        self.mine = []

    def choose_placement(self, board_size, fleet):
        return [[2 * i, 0, "H"] for i in range(len(fleet))]

    def choose_shot(self, view):
        Spy.seen.append({"view": copy.deepcopy(view), "mine": list(self.mine)})
        shot = next(
            (r, c)
            for r in range(view["size"])
            for c in range(view["size"])
            if view["cells"][r][c] == UNKNOWN
        )
        self.mine.append(shot)
        # tampering with its copy of the view must not change the real game
        for row in view["cells"]:
            row[:] = [HIT] * len(row)
        return shot


@pytest.mark.parametrize("opponent", PLAYERS, ids=lambda p: p.name)
def test_no_view_reveals_a_ship_that_was_not_shot(opponent):
    """Every view a bot receives shows exactly the cells it shot, nothing else."""
    for first in (0, 1):
        Spy.seen = []
        record = run_game([Spy, opponent.cls], spec((5, 6), first=first))
        assert record["forfeits"] == []
        assert Spy.seen, "the spy was never asked to shoot"
        for entry in Spy.seen:
            view, mine = entry["view"], set(entry["mine"])
            assert set(view) == {"size", "cells", "remaining"}
            for r, row in enumerate(view["cells"]):
                for c, state in enumerate(row):
                    if (r, c) in mine:
                        assert state in (MISS, HIT, SUNK)
                    else:
                        assert state == UNKNOWN, f"view shows {(r, c)} before it was shot"
            assert all(isinstance(n, int) for n in view["remaining"])


def test_bots_never_change_the_view_they_are_given():
    """Built-in and submitted bots treat the view as read-only (the engine copies it anyway)."""
    rng = random.Random(3)
    view = {
        "size": DEFAULT_SIZE,
        "cells": [
            [rng.choice([UNKNOWN, UNKNOWN, MISS]) for _ in range(DEFAULT_SIZE)]
            for _ in range(DEFAULT_SIZE)
        ],
        "remaining": sorted(DEFAULT_FLEET, reverse=True),
    }
    for player in PLAYERS:
        before = repr(view)
        player.cls.create(1).choose_shot(view)
        assert repr(view) == before, player.name
