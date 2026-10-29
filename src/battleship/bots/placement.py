"""Fleet placement strategies: ``(board_size, fleet, rng) -> placement``."""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import Any

from battleship.bots.shooting import probability_map
from battleship.game import UNKNOWN, random_placement, ship_cells


def random_fleet(board_size: int, fleet: Sequence[int], rng: random.Random) -> list[list[Any]]:
    """Any legal placement, chosen at random."""
    return random_placement(board_size, fleet, rng)


def stealth_fleet(
    board_size: int, fleet: Sequence[int], rng: random.Random, samples: int = 20
) -> list[list[Any]]:
    """Of ``samples`` random placements, the one a probability hunter is least likely to hit.

    Each candidate is scored by how much of the opening probability map its ships cover
    (the map is highest in the middle of the board, lowest along edges and corners).
    Sampling instead of optimising keeps the result varied, so it is not a fixed pattern.
    """
    empty_view = {
        "size": board_size,
        "cells": [[UNKNOWN] * board_size for _ in range(board_size)],
        "remaining": sorted(fleet, reverse=True),
    }
    heat = probability_map(empty_view)

    def exposure(placement: list[list[Any]]) -> int:
        return sum(
            heat[r][c]
            for length, (row, col, orientation) in zip(fleet, placement, strict=True)
            for r, c in ship_cells(row, col, length, orientation)
        )

    candidates = [random_placement(board_size, fleet, rng) for _ in range(samples)]
    return min(candidates, key=exposure)
