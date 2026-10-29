"""Shooting strategies: ``(view, ...) -> (row, col)``, pure functions of the attacker's view."""

from __future__ import annotations

import random

from battleship.game import Cell, View, legal_shots


def random_shot(view: View, rng: random.Random) -> Cell:
    """Any cell not shot yet, uniformly at random. The baseline."""
    return rng.choice(legal_shots(view))


def scan_shot(view: View) -> Cell:
    """The first cell not shot yet, reading row by row."""
    return legal_shots(view)[0]
