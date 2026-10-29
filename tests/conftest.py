import random
from pathlib import Path

import pytest

from battleship.game import (
    DEFAULT_FLEET,
    DEFAULT_SIZE,
    apply_shot,
    is_legal_shot,
    is_terminal,
    new_board,
    random_placement,
    view_for_attacker,
)
from battleship.registry import default_manifests, load_players

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def builtin_players():
    return load_players(default_manifests(ROOT)[:1])


def shots_to_sink(player, seed, size=DEFAULT_SIZE, fleet=DEFAULT_FLEET):
    """Let ``player`` shoot at a random fleet until it is sunk, checking every shot is legal.

    Returns the number of shots taken.
    """
    rng = random.Random(seed)
    board = new_board(size, fleet, random_placement(size, fleet, rng))
    shots = 0
    while not is_terminal(board):
        view = view_for_attacker(board)
        shot = player.choose_shot(view)
        assert is_legal_shot(view, shot), f"illegal shot {shot!r}"
        board, _ = apply_shot(board, shot)
        shots += 1
    return shots
