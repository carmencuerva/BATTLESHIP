"""CarLuBot: a probability hunter that also learns, during the game, how its rival hides.

Shooting. For every unshot cell, add up the legal positions of the ships still afloat that
cover it, and shoot the best one. A position is legal only if it agrees with everything
the view says and with the rule that ships never touch, not even diagonally: it avoids
water, sunk ships and the ring around them, the cells diagonal to a hit, and it never
brushes past a hit it does not contain. While a ship is hit but not sunk, only positions
that contain those hits count, so the bot finishes it before hunting again.

Unlike "hard", positions are not all worth the same. CarLuBot keeps two hypotheses about
how the rival placed its fleet:

- "even": every legal position equally likely (a random placement);
- "hiding": positions where a probability hunter looks last are more likely. Each position
  is weighted by ``exp(-HIDING_STRENGTH * exposure)``, where ``exposure`` is how much of the
  opening probability map it covers (0 for the least exposed position, 1 for the most).

Both hypotheses are built from the board itself, so they work for any board size and
fleet. Every cell uncovered so far (water or ship) is evidence: Bayes' rule compares how
likely it was under each hypothesis and updates the belief. Each position then weighs
``(1 - belief) * P_even + belief * P_hiding`` (a mixture of the two models).

Placement. Of 120 random legal placements, scored by how much of a plain hunter's opening
map they cover, one of the least exposed is drawn at random (a soft minimum), so the
fleet is hard to find but never the same.
"""

import math
import random

from battleship.game import HIT, MISS, SUNK, UNKNOWN, random_placement
from battleship.player import Player

HIDING_STRENGTH = 2.0  # how sharply a hider avoids exposed positions (0 = not at all)
PRIOR_HIDING = 0.5  # belief before any cell is uncovered
EVIDENCE_WEIGHT = 0.5  # cells are not independent: count each one as half a piece of evidence

PLACEMENT_SAMPLES = 120
PLACEMENT_SOFTNESS = 0.25  # how far (in average cells) the draw may wander from the least exposed

_POSITIONS = {}  # (size, length) -> list of (cells, ring), computed once
_MODELS = {}  # (size, fleet) -> (weights per length, occupancy per model), computed once


def _positions(size, length):
    """Every position of a ship of ``length`` on a ``size`` board, as flat cell indices,
    with the cells around it (its "ring")."""
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
                    found.append(
                        (
                            tuple(x * size + y for x, y in cells),
                            tuple(x * size + y for x, y in ring),
                        )
                    )
            if length == 1:
                break  # a one-cell ship has a single orientation
        _POSITIONS[key] = found
    return _POSITIONS[key]


def _opening_heat(size, fleet):
    """How many positions of the whole fleet cover each cell on an empty board."""
    heat = [0] * (size * size)
    for length in fleet:
        for cells, _ in _positions(size, length):
            for i in cells:
                heat[i] += 1
    return heat


def _models(size, fleet):
    """For each ship length, the probability of each of its positions under "even" and
    under "hiding"; and, for each cell, how likely it holds a ship under each model."""
    key = (size, tuple(sorted(fleet, reverse=True)))
    if key not in _MODELS:
        opening = _opening_heat(size, fleet)
        weights = {}
        for length in set(fleet):
            positions = _positions(size, length)
            exposure = [sum(opening[i] for i in cells) / length for cells, _ in positions]
            low, high = min(exposure), max(exposure)
            spread = (high - low) or 1.0
            hide = [math.exp(-HIDING_STRENGTH * (e - low) / spread) for e in exposure]
            total = sum(hide)
            weights[length] = (
                [1.0 / len(positions)] * len(positions),
                [h / total for h in hide],
            )
        occupancy = ([0.0] * (size * size), [0.0] * (size * size))
        for length in fleet:
            for k, (cells, _) in enumerate(_positions(size, length)):
                for model in (0, 1):
                    for i in cells:
                        occupancy[model][i] += weights[length][model][k]
        # a probability, not an expected count: keep it inside (0, 1)
        occupancy = tuple([min(max(p, 1e-6), 1 - 1e-6) for p in occ] for occ in occupancy)
        _MODELS[key] = (weights, occupancy)
    return _MODELS[key]


def _clusters(size, flat, state):
    """Groups of orthogonally connected cells in ``state`` (HIT: one unfinished ship each;
    SUNK: one sunk ship each, since ships never touch)."""
    cluster = [-1] * (size * size)
    count = 0
    for start, value in enumerate(flat):
        if value != state or cluster[start] != -1:
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
                if j >= 0 and flat[j] == state and cluster[j] == -1:
                    cluster[j] = count
                    stack.append(j)
        count += 1
    return cluster, count


def whole_fleet(view):
    """The fleet the game started with: ships still afloat plus every sunk ship."""
    size = view["size"]
    flat = [state for row in view["cells"] for state in row]
    cluster, count = _clusters(size, flat, SUNK)
    sunk = [0] * count
    for k in cluster:
        if k >= 0:
            sunk[k] += 1
    return sorted(list(view["remaining"]) + sunk, reverse=True)


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


def heat_map(view, belief=0.0):
    """Weighted count of legal positions covering each cell (a flat list), and whether
    some ship is hit but not yet sunk (then only positions through those hits count).

    ``belief`` is how likely the rival hides (0 counts every position the same, as "hard")."""
    size = view["size"]
    flat = [state for row in view["cells"] for state in row]
    weights, _ = _models(size, whole_fleet(view))
    blocked = _blocked(size, flat)
    cluster, clusters = _clusters(size, flat, HIT)
    sizes = [0] * clusters
    for k in cluster:
        if k >= 0:
            sizes[k] += 1
    heat = [0.0] * (size * size)
    for length in view["remaining"]:
        even, hide = weights[length]
        scale = len(even)  # so that with belief 0 every position weighs exactly 1
        for k, (cells, ring) in enumerate(_positions(size, length)):
            if any(blocked[i] for i in cells):
                continue
            if clusters:
                covered = {cluster[i] for i in cells if cluster[i] >= 0}
                if not covered:
                    continue
                # it must hold each hit group it touches entirely, and brush past none
                if sum(sizes[g] for g in covered) != sum(1 for i in cells if cluster[i] >= 0):
                    continue
                if any(cluster[j] >= 0 for j in ring):
                    continue
            weight = scale * ((1 - belief) * even[k] + belief * hide[k])
            for i in cells:
                if flat[i] == UNKNOWN:
                    heat[i] += weight
    return heat, clusters > 0


def hiding_belief(view, prior=None):
    """How likely the rival hides where hunters look least, from every cell uncovered so
    far: a ship cell where the hiding model expected one, or water where it expected none,
    makes "hiding" more likely, and the other way round."""
    size = view["size"]
    _, (even, hide) = _models(size, whole_fleet(view))
    prior = PRIOR_HIDING if prior is None else prior
    log_odds = math.log(prior / (1 - prior))
    for r, row in enumerate(view["cells"]):
        for c, state in enumerate(row):
            i = r * size + c
            if state in (HIT, SUNK):
                log_odds += EVIDENCE_WEIGHT * math.log(hide[i] / even[i])
            elif state == MISS:
                log_odds += EVIDENCE_WEIGHT * math.log((1 - hide[i]) / (1 - even[i]))
    log_odds = max(-30.0, min(30.0, log_odds))
    return 1 / (1 + math.exp(-log_odds))


class CarLuBot(Player):
    """Probability hunter with the no-touch rule; learns whether the rival hides."""

    @classmethod
    def get_name(cls):
        return "car_lu"

    @classmethod
    def get_authors(cls):
        return ["Lucía Argüello", "Carmen Cuerva"]

    @classmethod
    def get_description(cls):
        return (
            "Counts every ship position the no-touch rule allows; learns during the game "
            "whether you hide where hunters look least. Fleet hidden, never the same."
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
        opening = _opening_heat(board_size, fleet)

        def exposure(placement):
            total = 0
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
        unit = max(1.0, sum(opening) / (board_size * board_size))  # one average cell
        weights = [math.exp(-(s - low) / (PLACEMENT_SOFTNESS * unit)) for s in scores]
        return self.rng.choices(candidates, weights)[0]

    def choose_shot(self, view):
        size = view["size"]
        belief = hiding_belief(view)
        heat, _ = heat_map(view, belief)
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
