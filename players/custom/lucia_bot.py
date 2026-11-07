"""LuciaBot: a probability hunter that also learns, game by game, where its rival hides.

Shooting. For every unshot cell, count the legal positions of the ships still afloat that
cover it, and shoot the best one. A position is legal only if it agrees with everything
the view says and with the rule that ships never touch, not even diagonally: it avoids
water, sunk ships and the ring around them, the cells diagonal to a hit, and it never
brushes past a hit it does not contain. While a ship is hit but not sunk, only positions
that contain those hits count, so the bot finishes it before hunting again.

Each position is weighted by how many of its cells lie on the border. Good hiders put
their fleet along the edges, where plain probability hunters look last; good hunters
therefore look there a little earlier. How much is decided during the game: LuciaBot
weighs two hypotheses about the rival, "hides along the edges" and "places evenly", and
updates them (Bayes' rule) with every ship cell it uncovers, on the border or not.

Placement. Of 60 random legal placements, scored by how much of a plain hunter's opening
map they cover, one of the least exposed is drawn at random (a soft minimum), so the
fleet is hard to find but never the same.
"""

import math
import random

from battleship.game import HIT, MISS, SUNK, UNKNOWN, random_placement
from battleship.player import Player

# How likely a ship cell is to be on the border, under each hypothesis about the rival.
# Measured on 2000 placements of the default 10x10 fleet: 31.8% for the arena's random
# placement, 57.8% for its stealth placement (the one "hard" uses).
BORDER_IF_EVEN = 0.32
BORDER_IF_HIDING = 0.58
EDGE_WEIGHT = 1.0  # weight exp(EDGE_WEIGHT * border share) for a position, if the rival hides
PRIOR_HIDING = 0.5  # belief before the first ship cell is seen

PLACEMENT_SAMPLES = 60
PLACEMENT_SOFTNESS = 3.0  # how far from the least exposed placement the draw may wander

_POSITIONS = {}  # (size, length) -> list of (cells, ring, border share), computed once


def _positions(size, length):
    """Every position of a ship of ``length`` on a ``size`` board, as flat cell indices,
    with the cells around it (its "ring") and the share of its cells on the border."""
    key = (size, length)
    if key not in _POSITIONS:
        found = []
        for horizontal in (True, False):
            for r in range(size - (0 if horizontal else length - 1)):
                for c in range(size - (length - 1 if horizontal else 0)):
                    cells = [(r, c + k) if horizontal else (r + k, c) for k in range(length)]
                    inside = set(cells)
                    ring = {
                        (x + dr, y + dc)
                        for x, y in cells
                        for dr in (-1, 0, 1)
                        for dc in (-1, 0, 1)
                        if 0 <= x + dr < size and 0 <= y + dc < size
                    } - inside
                    border = sum(1 for x, y in cells if x in (0, size - 1) or y in (0, size - 1))
                    found.append(
                        (
                            tuple(x * size + y for x, y in cells),
                            tuple(x * size + y for x, y in ring),
                            border / length,
                        )
                    )
            if length == 1:
                break  # a one-cell ship has a single orientation
        _POSITIONS[key] = found
    return _POSITIONS[key]


def _clusters(size, flat):
    """Groups of orthogonally connected HIT cells: each belongs to one unfinished ship."""
    cluster = [-1] * (size * size)
    count = 0
    for start, state in enumerate(flat):
        if state != HIT or cluster[start] != -1:
            continue
        cluster[start] = count
        stack = [start]
        while stack:
            i = stack.pop()
            r, c = divmod(i, size)
            for j in (
                i - size if r else -1,
                i + size if r < size - 1 else -1,
                i - 1 if c else -1,
                i + 1 if c < size - 1 else -1,
            ):
                if j >= 0 and flat[j] == HIT and cluster[j] == -1:
                    cluster[j] = count
                    stack.append(j)
        count += 1
    return cluster, count


def _blocked(size, flat):
    """Cells no ship position may use: water, sunk ships and their ring, and the cells
    diagonal to a hit (ships never touch, so those can only be water)."""
    blocked = [False] * (size * size)
    for i, state in enumerate(flat):
        if state == UNKNOWN:
            continue
        r, c = divmod(i, size)
        if state in (MISS, SUNK):
            blocked[i] = True
        if state == SUNK:
            around = [(dr, dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if dr or dc]
        elif state == HIT:
            around = [(-1, -1), (-1, 1), (1, -1), (1, 1)]
        else:
            continue
        for dr, dc in around:
            if 0 <= r + dr < size and 0 <= c + dc < size:
                blocked[(r + dr) * size + c + dc] = True
    return blocked


def heat_map(view, edge_weight=0.0):
    """Weighted count of legal positions covering each cell (a flat list), and whether
    some ship is hit but not yet sunk (then only positions through those hits count)."""
    size = view["size"]
    flat = [state for row in view["cells"] for state in row]
    blocked = _blocked(size, flat)
    cluster, clusters = _clusters(size, flat)
    sizes = [0] * clusters
    for k in cluster:
        if k >= 0:
            sizes[k] += 1
    heat = [0.0] * (size * size)
    for length in view["remaining"]:
        for cells, ring, border in _positions(size, length):
            if any(blocked[i] for i in cells):
                continue
            if clusters:
                covered = {cluster[i] for i in cells if cluster[i] >= 0}
                if not covered:
                    continue
                # it must hold each hit group it touches entirely, and brush past none
                if sum(sizes[k] for k in covered) != sum(1 for i in cells if cluster[i] >= 0):
                    continue
                if any(cluster[j] >= 0 for j in ring):
                    continue
            weight = math.exp(edge_weight * border) if edge_weight else 1.0
            for i in cells:
                if flat[i] == UNKNOWN:
                    heat[i] += weight
    return heat, clusters > 0


def hiding_belief(view, prior=PRIOR_HIDING):
    """How likely the rival hides along the edges, from the ship cells uncovered so far."""
    size = view["size"]
    odds = prior / (1 - prior)
    for r, row in enumerate(view["cells"]):
        for c, state in enumerate(row):
            if state in (HIT, SUNK):
                on_border = r in (0, size - 1) or c in (0, size - 1)
                if on_border:
                    odds *= BORDER_IF_HIDING / BORDER_IF_EVEN
                else:
                    odds *= (1 - BORDER_IF_HIDING) / (1 - BORDER_IF_EVEN)
    return odds / (1 + odds)


class LuciaBot(Player):
    """Probability hunter with the no-touch rule; learns whether the rival hides on the edges."""

    @classmethod
    def get_name(cls):
        return "lucia"

    @classmethod
    def get_authors(cls):
        return ["Lucía Argüello"]

    @classmethod
    def get_description(cls):
        return (
            "Counts every ship position the no-touch rule allows; learns during the game "
            "whether you hide along the edges. Fleet hidden, never the same."
        )

    @classmethod
    def get_icon(cls):
        return "🐬"

    @classmethod
    def create(cls, seed):
        return cls(seed)

    def __init__(self, seed=None):
        self.rng = random.Random(seed)

    def choose_placement(self, board_size, fleet):
        empty = {
            "size": board_size,
            "cells": [[UNKNOWN] * board_size for _ in range(board_size)],
            "remaining": sorted(fleet, reverse=True),
        }
        opening, _ = heat_map(empty)

        def exposure(placement):
            total = 0.0
            for length, (row, col, orientation) in zip(fleet, placement, strict=True):
                for k in range(length):
                    r, c = (row, col + k) if orientation == "H" else (row + k, col)
                    total += opening[r * board_size + c]
            return total

        candidates = [
            random_placement(board_size, fleet, self.rng) for _ in range(PLACEMENT_SAMPLES)
        ]
        scores = [exposure(p) for p in candidates]
        low = min(scores)
        weights = [math.exp(-(s - low) / PLACEMENT_SOFTNESS) for s in scores]
        return self.rng.choices(candidates, weights)[0]

    def choose_shot(self, view):
        size = view["size"]
        belief = hiding_belief(view)
        heat, _ = heat_map(view, EDGE_WEIGHT * belief)
        flat = [state for row in view["cells"] for state in row]
        options = [i for i, state in enumerate(flat) if state == UNKNOWN]
        best = max(heat[i] for i in options)
        if best <= 0:  # the view admits no ship at all (cannot happen in a legal game)
            pick = self.rng.choice(options)
        else:
            pick = self.rng.choice([i for i in options if heat[i] >= best * (1 - 1e-9)])
        top = max(heat) or 1.0
        self.last_info = {
            "heatmap": [
                [round(9 * heat[r * size + c] / top) for c in range(size)] for r in range(size)
            ],
            "hiding": round(belief, 2),
        }
        return divmod(pick, size)
