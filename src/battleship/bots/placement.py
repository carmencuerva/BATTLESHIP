"""Fleet placement strategies: ``(board_size, fleet, rng) -> placement``."""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import Any

from battleship.game import random_placement


def random_fleet(board_size: int, fleet: Sequence[int], rng: random.Random) -> list[list[Any]]:
    """Any legal placement, chosen at random."""
    return random_placement(board_size, fleet, rng)
