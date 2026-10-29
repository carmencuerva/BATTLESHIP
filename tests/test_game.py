import copy
import json
import random

import pytest

from battleship.game import (
    DEFAULT_FLEET,
    DEFAULT_SIZE,
    HIT,
    MISS,
    SUNK,
    UNKNOWN,
    apply_shot,
    is_legal_shot,
    is_terminal,
    is_valid_placement,
    legal_shots,
    new_board,
    next_attacker,
    random_placement,
    validate_fleet,
    validate_placement,
    view_for_attacker,
)

# Five horizontal ships on even rows, all flush left: legal and easy to reason about.
STACKED = [[0, 0, "H"], [2, 0, "H"], [4, 0, "H"], [6, 0, "H"], [8, 0, "H"]]


@pytest.fixture
def board():
    return new_board(DEFAULT_SIZE, DEFAULT_FLEET, STACKED)


def random_board(seed):
    rng = random.Random(seed)
    return new_board(
        DEFAULT_SIZE, DEFAULT_FLEET, random_placement(DEFAULT_SIZE, DEFAULT_FLEET, rng)
    )


# --- fleet ---------------------------------------------------------------------------


def test_default_fleet_is_valid():
    assert validate_fleet(DEFAULT_SIZE, list(DEFAULT_FLEET)) is None


@pytest.mark.parametrize(
    "size, fleet",
    [
        (0, [1]),
        (True, [1]),
        (10, []),
        (10, [0]),
        (10, [2.5]),
        (10, [11]),
        (3, [3, 3, 3]),  # cannot fit without touching
    ],
)
def test_invalid_fleets(size, fleet):
    assert validate_fleet(size, fleet) is not None


# --- placement -----------------------------------------------------------------------


def test_stacked_placement_is_valid():
    assert validate_placement(DEFAULT_SIZE, DEFAULT_FLEET, STACKED) is None


def test_placement_accepts_tuples():
    assert is_valid_placement(DEFAULT_SIZE, DEFAULT_FLEET, [tuple(p) for p in STACKED])


@pytest.mark.parametrize(
    "change, fragment",
    [
        ({4: [8, 9, "H"]}, "off the board"),
        ({4: [9, 0, "V"]}, "off the board"),
        ({4: [-1, 0, "H"]}, "off the board"),
        ({1: [0, 5, "H"]}, "touches"),  # same row, end to end
        ({1: [1, 5, "H"]}, "touches"),  # diagonal contact with ship 0's last cell
        ({1: [1, 0, "H"]}, "touches"),  # directly under ship 0
        ({1: [0, 2, "V"]}, "overlaps"),
        ({0: [0, 0, "D"]}, "orientation"),
        ({0: [0, True, "H"]}, "ints"),
        ({0: [0, 0]}, "expected"),
    ],
)
def test_invalid_placements(change, fragment):
    placement = [change.get(i, p) for i, p in enumerate(STACKED)]
    reason = validate_placement(DEFAULT_SIZE, DEFAULT_FLEET, placement)
    assert reason is not None and fragment in reason


def test_wrong_number_of_ships():
    assert not is_valid_placement(DEFAULT_SIZE, DEFAULT_FLEET, STACKED[:-1])
    assert not is_valid_placement(DEFAULT_SIZE, DEFAULT_FLEET, "nope")


def test_new_board_rejects_illegal_placement():
    with pytest.raises(ValueError, match="touches"):
        new_board(DEFAULT_SIZE, DEFAULT_FLEET, [[0, 0, "H"], [1, 0, "H"], *STACKED[2:]])


@pytest.mark.parametrize("seed", range(50))
def test_random_placement_is_valid(seed):
    placement = random_placement(DEFAULT_SIZE, DEFAULT_FLEET, random.Random(seed))
    assert is_valid_placement(DEFAULT_SIZE, DEFAULT_FLEET, placement)


def test_random_placement_is_deterministic_and_varied():
    first = [random_placement(DEFAULT_SIZE, DEFAULT_FLEET, random.Random(s)) for s in range(20)]
    again = [random_placement(DEFAULT_SIZE, DEFAULT_FLEET, random.Random(s)) for s in range(20)]
    assert first == again
    assert len({json.dumps(p) for p in first}) > 15


def test_random_placement_custom_config():
    placement = random_placement(6, [3, 2, 2, 1], random.Random(1))
    assert is_valid_placement(6, [3, 2, 2, 1], placement)


def test_random_placement_raises_when_impossible():
    # Passes the density bound, but any two cells of a 2x2 board touch.
    with pytest.raises(ValueError):
        random_placement(2, [1, 1], random.Random(0), max_attempts=20)


# --- shots ---------------------------------------------------------------------------


def test_miss_hit_sunk(board):
    board, result = apply_shot(board, (9, 9))
    assert result == {"outcome": "miss", "length": None}
    board, result = apply_shot(board, (8, 0))
    assert result == {"outcome": "hit", "length": None}
    board, result = apply_shot(board, [8, 1])
    assert result == {"outcome": "sunk", "length": 2}


@pytest.mark.parametrize("shot", [(10, 0), (0, -1), (0,), "a1", (0.0, 1), (True, 0), None])
def test_malformed_or_out_of_bounds_shot_raises(board, shot):
    with pytest.raises(ValueError):
        apply_shot(board, shot)


def test_repeated_shot_raises(board):
    board, _ = apply_shot(board, (5, 5))
    with pytest.raises(ValueError, match="already"):
        apply_shot(board, [5, 5])


def test_apply_shot_does_not_mutate(board):
    before = copy.deepcopy(board)
    after, _ = apply_shot(board, (0, 0))
    assert board == before
    after["shots"][0][0] = 99
    after["ships"][0][0][0] = 99
    assert board == before


def test_view_and_terminal_do_not_mutate(board):
    board, _ = apply_shot(board, (0, 0))
    before = copy.deepcopy(board)
    view = view_for_attacker(board)
    is_terminal(board)
    legal_shots(view)
    view_before = copy.deepcopy(view)
    is_legal_shot(view, (1, 1))
    assert board == before and view == view_before


def test_json_round_trip_board_still_playable(board):
    board, _ = apply_shot(board, (0, 0))
    board = json.loads(json.dumps(board))
    board, result = apply_shot(board, (0, 1))
    assert result["outcome"] == "hit"
    assert json.loads(json.dumps(view_for_attacker(board))) == view_for_attacker(board)


# --- view ----------------------------------------------------------------------------


def test_view_cell_states(board):
    for shot in [(9, 9), (0, 0), (8, 0), (8, 1)]:
        board, _ = apply_shot(board, shot)
    view = view_for_attacker(board)
    assert view["size"] == DEFAULT_SIZE
    assert view["cells"][9][9] == MISS
    assert view["cells"][0][0] == HIT
    assert view["cells"][8][0] == view["cells"][8][1] == SUNK
    assert view["cells"][0][1] == UNKNOWN
    assert view["remaining"] == [5, 4, 3, 3]


@pytest.mark.parametrize("seed", range(30))
def test_view_never_leaks_unshot_ships(seed):
    """CRITICAL: an attacker's view reveals nothing about cells it has not shot."""
    rng = random.Random(seed)
    board = random_board(seed)
    cells = [(r, c) for r in range(DEFAULT_SIZE) for c in range(DEFAULT_SIZE)]
    rng.shuffle(cells)
    for shot in cells[: rng.randrange(len(cells))]:
        board, _ = apply_shot(board, shot)
        view = view_for_attacker(board)
        assert set(view) == {"size", "cells", "remaining"}
        shots = {tuple(s) for s in board["shots"]}
        for r in range(DEFAULT_SIZE):
            for c in range(DEFAULT_SIZE):
                if (r, c) not in shots:
                    assert view["cells"][r][c] == UNKNOWN
                else:
                    assert view["cells"][r][c] != UNKNOWN


def test_view_is_identical_for_boards_differing_only_in_unshot_cells():
    a = new_board(DEFAULT_SIZE, DEFAULT_FLEET, STACKED)
    b = new_board(
        DEFAULT_SIZE,
        DEFAULT_FLEET,
        [[0, 0, "H"], [2, 0, "H"], [4, 0, "H"], [6, 0, "H"], [8, 5, "H"]],
    )
    for shot in [(0, 0), (9, 9), (5, 5)]:
        a, _ = apply_shot(a, shot)
        b, _ = apply_shot(b, shot)
    assert view_for_attacker(a) == view_for_attacker(b)


# --- end of game and turns -----------------------------------------------------------


def test_terminal_only_after_last_ship_sunk(board):
    ship_cells = [tuple(c) for ship in board["ships"] for c in ship]
    for cell in ship_cells[:-1]:
        board, _ = apply_shot(board, cell)
        assert not is_terminal(board)
    board, result = apply_shot(board, ship_cells[-1])
    assert result["outcome"] == "sunk"
    assert is_terminal(board)
    assert view_for_attacker(board)["remaining"] == []


def test_legal_shots_shrink(board):
    view = view_for_attacker(board)
    assert len(legal_shots(view)) == DEFAULT_SIZE**2
    assert is_legal_shot(view, (3, 3))
    board, _ = apply_shot(board, (3, 3))
    view = view_for_attacker(board)
    assert (3, 3) not in legal_shots(view)
    assert not is_legal_shot(view, (3, 3))
    assert not is_legal_shot(view, (10, 0))
    assert not is_legal_shot(view, "x")
    assert len(legal_shots(view)) == DEFAULT_SIZE**2 - 1


def test_next_attacker_repeats_on_hit_and_sunk():
    assert next_attacker(0, {"outcome": "miss", "length": None}) == 1
    assert next_attacker(1, {"outcome": "miss", "length": None}) == 0
    assert next_attacker(0, {"outcome": "hit", "length": None}) == 0
    assert next_attacker(1, {"outcome": "sunk", "length": 3}) == 1


@pytest.mark.parametrize("seed", range(10))
def test_full_random_game_ends_within_board_cells(seed):
    rng = random.Random(seed)
    board = random_board(seed)
    shots = 0
    while not is_terminal(board):
        board, _ = apply_shot(board, rng.choice(legal_shots(view_for_attacker(board))))
        shots += 1
    assert sum(DEFAULT_FLEET) <= shots <= DEFAULT_SIZE**2
