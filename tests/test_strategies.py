import json
import random
import statistics

import pytest

from battleship.bots import (
    hit_clusters,
    hunt_target_shot,
    probability_map,
    probability_shot,
    random_fleet,
    stealth_fleet,
)
from battleship.game import (
    DEFAULT_FLEET,
    DEFAULT_SIZE,
    HIT,
    MISS,
    SUNK,
    UNKNOWN,
    apply_shot,
    is_terminal,
    is_valid_placement,
    legal_shots,
    new_board,
    random_placement,
    ship_cells,
    view_for_attacker,
)

from .conftest import shots_to_sink


def make_view(rows, remaining):
    """Build a view from strings: '.' unknown, 'o' miss, 'X' hit, '#' sunk."""
    code = {".": UNKNOWN, "o": MISS, "X": HIT, "#": SUNK}
    return {
        "size": len(rows),
        "cells": [[code[ch] for ch in row] for row in rows],
        "remaining": remaining,
    }


EMPTY = make_view(["." * 10] * 10, list(DEFAULT_FLEET))


# --- hit clusters ------------------------------------------------------------------------


def test_hit_clusters():
    view = make_view(["X.X..", "X....", ".....", "...XX", "#...."], [3, 2])
    assert hit_clusters(view) == [[(0, 0), (1, 0)], [(0, 2)], [(3, 3), (3, 4)]]


# --- hunt & target -----------------------------------------------------------------------


def test_hunt_uses_parity_of_shortest_ship():
    rng = random.Random(0)
    for remaining in ([5, 4, 3, 3, 2], [5, 3]):
        view = make_view(["." * 10] * 10, remaining)
        for _ in range(50):
            r, c = hunt_target_shot(view, rng)
            assert (r + c) % min(remaining) == 0


def test_target_tries_neighbours_of_a_single_hit():
    view = make_view([".....", ".....", "..X..", ".....", "....."], [3])
    shots = {hunt_target_shot(view, random.Random(s)) for s in range(40)}
    assert shots == {(1, 2), (3, 2), (2, 1), (2, 3)}


def test_target_extends_a_line_of_hits():
    view = make_view([".....", ".oXX.", ".....", ".....", "....."], [3])
    assert hunt_target_shot(view, random.Random(0)) == (1, 4)


# --- probability map ---------------------------------------------------------------------


def test_opening_map_is_symmetric_and_peaks_in_the_middle():
    heat = probability_map(EMPTY)
    assert heat == [row[::-1] for row in heat] == [list(col) for col in zip(*heat, strict=True)]
    assert heat[0][0] < heat[4][4]


def test_shot_cells_and_sunk_surroundings_score_zero():
    view = make_view(["o.........", ".###......", ".........."] + ["." * 10] * 7, [5, 4, 3, 2])
    heat = probability_map(view)
    assert heat[0][0] == 0
    for r in range(3):
        for c in range(5):
            assert heat[r][c] == 0, (r, c)
    assert heat[5][5] > 0


def test_target_mode_only_counts_positions_through_the_hit():
    view = make_view(["." * 10] * 4 + ["....X....."] + ["." * 10] * 5, [5, 4, 3, 3, 2])
    heat = probability_map(view)
    for r in range(10):
        for c in range(10):
            if r != 4 and c != 4:
                assert heat[r][c] == 0, (r, c)
    assert heat[3][4] > 0 and heat[4][5] > 0


def test_no_position_touches_a_hit_it_does_not_cover():
    # A hit at (2, 2): no ship elsewhere may sit next to it, even diagonally.
    view = make_view([".....", ".....", "..X..", ".....", "....."], [2])
    heat = probability_map(view)
    for cell in [(1, 1), (1, 3), (3, 1), (3, 3)]:
        assert heat[cell[0]][cell[1]] == 0


def test_one_ship_may_span_two_hit_clusters():
    # Regression: hits at rows 0-1 and 3-4 of column 4 can only be one 5-long ship.
    view = make_view(
        [
            "....X.....",
            "....X.#...",
            ".o...o#...",
            ".#.oX.#.#.",
            ".#.oXo..#.",
            ".#..o...#.",
            ".#o...o.o.",
            "...o..o...",
            ".....o....",
            "....o.....",
        ],
        [5, 2],
    )
    cell, heat = probability_shot(view, random.Random(0))
    assert cell == (2, 4)
    assert heat[2][4] > 0


@pytest.mark.parametrize("seed", range(8))
def test_map_never_goes_blank_in_a_real_game(seed):
    rng = random.Random(seed)
    board = new_board(DEFAULT_SIZE, DEFAULT_FLEET, random_placement(10, DEFAULT_FLEET, rng))
    while not is_terminal(board):
        view = view_for_attacker(board)
        heat = probability_map(view)
        assert max(heat[r][c] for r, c in legal_shots(view)) > 0
        shot, _ = probability_shot(view, rng)
        board, _ = apply_shot(board, shot)


def test_probability_shot_is_legal_and_json_friendly():
    shot, heat = probability_shot(EMPTY, random.Random(0))
    assert shot in legal_shots(EMPTY)
    assert json.loads(json.dumps(heat)) == heat


# --- placement -----------------------------------------------------------------------------


def exposure(placement):
    heat = probability_map(EMPTY)
    return sum(
        heat[r][c]
        for length, (row, col, o) in zip(DEFAULT_FLEET, placement, strict=True)
        for r, c in ship_cells(row, col, length, o)
    )


def test_stealth_fleet_is_legal_varied_and_less_exposed():
    stealth = [stealth_fleet(10, DEFAULT_FLEET, random.Random(s)) for s in range(20)]
    plain = [random_fleet(10, DEFAULT_FLEET, random.Random(s)) for s in range(20)]
    assert all(is_valid_placement(10, DEFAULT_FLEET, p) for p in stealth)
    assert len({json.dumps(p) for p in stealth}) == 20
    assert statistics.mean(map(exposure, stealth)) < statistics.mean(map(exposure, plain))


def test_stealth_fleet_custom_config():
    assert is_valid_placement(6, [3, 2, 2, 1], stealth_fleet(6, [3, 2, 2, 1], random.Random(0)))


# --- the ladder ----------------------------------------------------------------------------


def test_hard_sets_a_json_heatmap(builtin_players):
    hard = next(p for p in builtin_players if p.name == "hard").cls.create(0)
    hard.choose_shot(EMPTY)
    assert json.loads(json.dumps(hard.last_info)) == hard.last_info
    assert len(hard.last_info["heatmap"]) == DEFAULT_SIZE


def test_ladder_hard_beats_medium_beats_easy_close_to_random(builtin_players):
    games = 40
    mean = {
        p.name: statistics.mean(shots_to_sink(p.cls.create(s), 9000 + s) for s in range(games))
        for p in builtin_players
    }
    assert mean["hard"] + 5 < mean["medium"]
    assert mean["medium"] + 20 < mean["easy"]
    assert abs(mean["easy"] - mean["random"]) < 10
