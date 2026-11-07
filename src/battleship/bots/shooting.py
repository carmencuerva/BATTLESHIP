"""Shooting strategies: ``(view, ...) -> (row, col)``, pure functions of the attacker's view."""

from __future__ import annotations

import random

from battleship.game import (
    HIT,
    MISS,
    SUNK,
    UNKNOWN,
    Cell,
    View,
    in_bounds,
    legal_shots,
    neighbours,
    ship_cells,
)


def random_shot(view: View, rng: random.Random) -> Cell:
    """Any cell not shot yet, uniformly at random. The baseline."""
    return rng.choice(legal_shots(view))


def scan_shot(view: View) -> Cell:
    """The first cell not shot yet, reading row by row."""
    return legal_shots(view)[0]


# --- hunt & target -----------------------------------------------------------------------


def _orthogonal(size: int, cell: Cell) -> list[Cell]:
    row, col = cell
    around = [(row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)]
    return [c for c in around if in_bounds(size, c)]


def hit_clusters(view: View) -> list[list[Cell]]:
    """Groups of orthogonally connected HIT cells, in row-major order.

    Ships never touch, so each cluster belongs to exactly one ship still afloat (though one
    ship may show up as several clusters separated by unshot cells).
    """
    size, cells = view["size"], view["cells"]
    seen: set[Cell] = set()
    clusters = []
    for r in range(size):
        for c in range(size):
            if cells[r][c] != HIT or (r, c) in seen:
                continue
            cluster, stack = [], [(r, c)]
            seen.add((r, c))
            while stack:
                cell = stack.pop()
                cluster.append(cell)
                for other in _orthogonal(size, cell):
                    if other not in seen and cells[other[0]][other[1]] == HIT:
                        seen.add(other)
                        stack.append(other)
            clusters.append(sorted(cluster))
    return clusters


def certain_water(view: View) -> set[Cell]:
    """Unshot cells that cannot hold a ship, because ships never touch (not even diagonally):
    the cells around a sunk ship, and the cells diagonal to a hit."""
    size, cells = view["size"], view["cells"]
    water: set[Cell] = set()
    for r in range(size):
        for c in range(size):
            if cells[r][c] == SUNK:
                water.update(neighbours(size, (r, c)))
            elif cells[r][c] == HIT:
                water.update(
                    (r + dr, c + dc)
                    for dr in (-1, 1)
                    for dc in (-1, 1)
                    if in_bounds(size, (r + dr, c + dc))
                )
    return {(r, c) for r, c in water if cells[r][c] == UNKNOWN}


def hunt_target_shot(view: View, rng: random.Random) -> Cell:
    """Hunt on a parity grid until something is hit, then finish that ship.

    Target: with one hit, try its four neighbours; with a line of hits, extend the line.
    Hunt: only cells with ``(row + col) % shortest_ship == 0``, which every ship must cover.
    Neither ever shoots where the no-touch rule says there can only be water.
    """
    size, cells = view["size"], view["cells"]
    water = certain_water(view)

    def unknown(cs: list[Cell]) -> list[Cell]:
        return [
            c for c in cs if in_bounds(size, c) and cells[c[0]][c[1]] == UNKNOWN and c not in water
        ]

    clusters = hit_clusters(view)
    if clusters:
        cluster = clusters[0]
        (r0, c0), (r1, c1) = cluster[0], cluster[-1]
        if len(cluster) == 1:
            candidates = unknown(_orthogonal(size, cluster[0]))
        elif r0 == r1:
            candidates = unknown([(r0, c0 - 1), (r1, c1 + 1)])
        else:
            candidates = unknown([(r0 - 1, c0), (r1 + 1, c1)])
        if candidates:
            return rng.choice(candidates)

    open_cells = [c for c in legal_shots(view) if c not in water] or legal_shots(view)
    step = min(view["remaining"], default=1)
    parity = [(r, c) for r, c in open_cells if (r + c) % step == 0]
    return rng.choice(parity or open_cells)


# --- probability density -----------------------------------------------------------------


# Every position of a ship of a given length on a board of a given size, as
# (cells, ring): the cells it covers and the cells around it. Computed once per shape.
_POSITIONS: dict[tuple[int, int], list[tuple[tuple[Cell, ...], tuple[Cell, ...]]]] = {}


def _positions(size: int, length: int) -> list[tuple[tuple[Cell, ...], tuple[Cell, ...]]]:
    key = (size, length)
    if key not in _POSITIONS:
        found = []
        for orientation in ("H", "V"):
            for r in range(size):
                for c in range(size):
                    position = ship_cells(r, c, length, orientation)
                    if not in_bounds(size, position[-1]):
                        continue
                    inside = set(position)
                    ring = {n for x in position for n in neighbours(size, x)} - inside
                    found.append((tuple(position), tuple(sorted(ring))))
        _POSITIONS[key] = found
    return _POSITIONS[key]


def probability_map(view: View) -> list[list[int]]:
    """For each unshot cell, how many legal positions of the remaining ships cover it.

    A position is legal if it lies on unshot or HIT cells, keeps clear of sunk ships and
    their surroundings (ships never touch), and every hit cluster it covers or touches lies
    wholly inside it (a ship may span several clusters separated by unshot cells). While
    there are unresolved hits only positions that cover one are counted ("target mode").
    Shot cells always score 0.
    """
    size, cells = view["size"], view["cells"]
    clusters = hit_clusters(view)
    cluster_of = {cell: i for i, cluster in enumerate(clusters) for cell in cluster}
    cluster_size = [len(cluster) for cluster in clusters]
    blocked: set[Cell] = set()
    for r in range(size):
        for c in range(size):
            if cells[r][c] == MISS:
                blocked.add((r, c))
            elif cells[r][c] == SUNK:
                blocked.add((r, c))
                blocked.update(neighbours(size, (r, c)))

    heat = [[0] * size for _ in range(size)]
    for length in view["remaining"]:
        for position, ring in _positions(size, length):
            if any(x in blocked for x in position):
                continue
            if clusters:
                covered = [cluster_of[x] for x in position if x in cluster_of]
                if not covered:
                    continue
                # every cluster it covers lies wholly inside it, and it touches no other hit
                if sum(cluster_size[i] for i in set(covered)) != len(covered):
                    continue
                if any(n in cluster_of for n in ring):
                    continue
            for x, y in position:
                if cells[x][y] == UNKNOWN:
                    heat[x][y] += 1
    return heat


def probability_shot(view: View, rng: random.Random) -> tuple[Cell, list[list[int]]]:
    """The unshot cell covered by most legal ship positions (random among ties).

    Returns the shot and the heat map behind it (for the web's X-ray mode).
    """
    heat = probability_map(view)
    options = legal_shots(view)
    best = max(heat[r][c] for r, c in options)
    if best == 0:  # inconsistent view (cannot happen in a real game): any legal shot
        return rng.choice(options), heat
    return rng.choice([(r, c) for r, c in options if heat[r][c] == best]), heat
