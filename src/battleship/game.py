"""Pure Battleship rules engine.

Everything here works on plain, JSON-serialisable data (dicts, lists, ints, strings) so the
same values can cross the Python <-> JS boundary unchanged. No function mutates its
arguments: functions that "change" a board return a new one.

Rules (fixed for the arena):
- Square board of ``size`` x ``size`` cells, addressed as ``(row, col)``, 0-indexed.
- The fleet is a list of ship lengths. Ships may not overlap or touch, not even diagonally.
- A shot answers "miss", "hit" or "sunk"; "sunk" also announces the ship's length.
- A shooter who hits (or sinks) shoots again; a miss passes the turn (see ``next_attacker``).

Data shapes:
- placement: one ``[row, col, "H"|"V"]`` per ship, in the same order as ``fleet``.
  ``(row, col)`` is the ship's top/left cell; "H" extends right, "V" extends down.
- board (full truth, never shown to the attacker):
  ``{"size": int, "ships": [[[r, c], ...], ...], "shots": [[r, c], ...]}``
- view (all an attacker may know):
  ``{"size": int, "cells": [[UNKNOWN|MISS|HIT|SUNK, ...], ...], "remaining": [int, ...]}``
  ``remaining`` lists the lengths of ships still afloat, longest first.
- result: ``{"outcome": "miss"|"hit"|"sunk", "length": int | None}``
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import Any

DEFAULT_SIZE = 10
DEFAULT_FLEET: tuple[int, ...] = (5, 4, 3, 3, 2)

UNKNOWN, MISS, HIT, SUNK = 0, 1, 2, 3
HORIZONTAL, VERTICAL = "H", "V"
ORIENTATIONS = (HORIZONTAL, VERTICAL)

Cell = tuple[int, int]
Board = dict[str, Any]
View = dict[str, Any]
Result = dict[str, Any]


# --- cells -----------------------------------------------------------------------------


def _is_int(x: object) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def as_cell(obj: object) -> Cell | None:
    """Return ``obj`` as a ``(row, col)`` tuple, or None if it is not a pair of ints.

    Accepts lists as well as tuples, since JSON turns tuples into lists.
    """
    if not isinstance(obj, (list, tuple)) or len(obj) != 2:
        return None
    row, col = obj
    if not (_is_int(row) and _is_int(col)):
        return None
    return (row, col)


def in_bounds(size: int, cell: Cell) -> bool:
    return 0 <= cell[0] < size and 0 <= cell[1] < size


def ship_cells(row: int, col: int, length: int, orientation: str) -> list[Cell]:
    """Cells covered by a ship whose top/left cell is ``(row, col)``."""
    if orientation == HORIZONTAL:
        return [(row, col + i) for i in range(length)]
    return [(row + i, col) for i in range(length)]


def neighbours(size: int, cell: Cell) -> list[Cell]:
    """The up to 8 in-bounds cells around ``cell`` (diagonals included)."""
    row, col = cell
    return [
        (row + dr, col + dc)
        for dr in (-1, 0, 1)
        for dc in (-1, 0, 1)
        if (dr or dc) and in_bounds(size, (row + dr, col + dc))
    ]


# --- fleet and placement validation ----------------------------------------------------


def validate_fleet(size: object, fleet: object) -> str | None:
    """Return None if a board of ``size`` with ``fleet`` may be legal, else a reason.

    The density check is a necessary condition only: extend every ship one cell to the
    right and one down; non-touching ships give disjoint ``2 x (L+1)`` rectangles inside a
    ``(size+1) x (size+1)`` square. ``random_placement`` is the final word on feasibility.
    """
    if not isinstance(size, int) or isinstance(size, bool) or size < 1:
        return f"board size must be a positive int, got {size!r}"
    if not isinstance(fleet, (list, tuple)) or not fleet:
        return "fleet must be a non-empty list of ship lengths"
    for length in fleet:
        if not _is_int(length) or length < 1:
            return f"ship lengths must be positive ints, got {length!r}"
        if length > size:
            return f"ship of length {length} does not fit on a {size}x{size} board"
    if sum(2 * (length + 1) for length in fleet) > (size + 1) ** 2:
        return f"fleet {list(fleet)} is too dense for a {size}x{size} board without touching"
    return None


def validate_placement(size: int, fleet: Sequence[int], placement: object) -> str | None:
    """Return None if ``placement`` is legal for ``fleet`` on a ``size`` board, else a reason."""
    if not isinstance(placement, (list, tuple)) or len(placement) != len(fleet):
        return f"placement must be a list of {len(fleet)} [row, col, 'H'|'V'] entries"
    owner: dict[Cell, int] = {}
    for i, (length, entry) in enumerate(zip(fleet, placement, strict=True)):
        if not isinstance(entry, (list, tuple)) or len(entry) != 3:
            return f"ship {i}: expected [row, col, 'H'|'V'], got {entry!r}"
        start = as_cell(entry[:2])
        orientation = entry[2]
        if start is None:
            return f"ship {i}: row and col must be ints, got {entry!r}"
        if orientation not in ORIENTATIONS:
            return f"ship {i}: orientation must be 'H' or 'V', got {orientation!r}"
        for cell in ship_cells(start[0], start[1], length, orientation):
            if not in_bounds(size, cell):
                return f"ship {i} (length {length}) goes off the board at {list(cell)}"
            if cell in owner:
                return f"ship {i} overlaps ship {owner[cell]} at {list(cell)}"
            owner[cell] = i
    for cell, i in owner.items():
        for other in neighbours(size, cell):
            j = owner.get(other, i)
            if j != i:
                return f"ship {min(i, j)} touches ship {max(i, j)} near {list(cell)}"
    return None


def is_valid_placement(size: int, fleet: Sequence[int], placement: object) -> bool:
    return validate_placement(size, fleet, placement) is None


def random_placement(
    size: int, fleet: Sequence[int], rng: random.Random, max_attempts: int = 1000
) -> list[list[Any]]:
    """A uniformly-chosen-per-step legal placement, deterministic for a given ``rng`` state.

    Longest ships are placed first (they are the hardest to fit), but the result is in
    ``fleet`` order. Raises ValueError if the fleet does not fit.
    """
    reason = validate_fleet(size, fleet)
    if reason:
        raise ValueError(reason)
    order = sorted(range(len(fleet)), key=lambda i: -fleet[i])
    for _ in range(max_attempts):
        blocked: set[Cell] = set()
        placement: list[list[Any]] = [[] for _ in fleet]
        for i in order:
            options = [
                (row, col, orientation)
                for orientation in ORIENTATIONS
                for row in range(size)
                for col in range(size)
                if all(
                    in_bounds(size, cell) and cell not in blocked
                    for cell in ship_cells(row, col, fleet[i], orientation)
                )
            ]
            if not options:
                break
            row, col, orientation = rng.choice(options)
            for cell in ship_cells(row, col, fleet[i], orientation):
                blocked.add(cell)
                blocked.update(neighbours(size, cell))
            placement[i] = [row, col, orientation]
        else:
            return placement
    raise ValueError(f"could not fit fleet {list(fleet)} on a {size}x{size} board")


# --- boards and shots ------------------------------------------------------------------


def new_board(size: int, fleet: Sequence[int], placement: object) -> Board:
    """Build a fresh board (no shots yet). Raises ValueError on an illegal fleet/placement."""
    reason = validate_fleet(size, fleet) or validate_placement(size, fleet, placement)
    if reason:
        raise ValueError(reason)
    assert isinstance(placement, (list, tuple))
    ships = [
        [list(cell) for cell in ship_cells(entry[0], entry[1], length, entry[2])]
        for length, entry in zip(fleet, placement, strict=True)
    ]
    return {"size": size, "ships": ships, "shots": []}


def _ship_sets(board: Board) -> list[set[Cell]]:
    return [{(r, c) for r, c in ship} for ship in board["ships"]]


def _shot_set(board: Board) -> set[Cell]:
    return {(r, c) for r, c in board["shots"]}


def apply_shot(board: Board, shot: object) -> tuple[Board, Result]:
    """Fire at ``shot``; return ``(new_board, result)`` without touching ``board``.

    Raises ValueError if the shot is malformed, off the board or repeated.
    """
    cell = as_cell(shot)
    if cell is None or not in_bounds(board["size"], cell):
        raise ValueError(f"illegal shot {shot!r}: not a cell of the board")
    shots = _shot_set(board)
    if cell in shots:
        raise ValueError(f"illegal shot {shot!r}: cell already shot")
    shots.add(cell)
    new = {
        "size": board["size"],
        "ships": [[list(c) for c in ship] for ship in board["ships"]],
        "shots": [list(s) for s in board["shots"]] + [list(cell)],
    }
    for ship in _ship_sets(board):
        if cell in ship:
            if ship <= shots:
                return new, {"outcome": "sunk", "length": len(ship)}
            return new, {"outcome": "hit", "length": None}
    return new, {"outcome": "miss", "length": None}


def view_for_attacker(board: Board) -> View:
    """What the attacker may know: shot cells and the lengths still afloat. Never more."""
    size = board["size"]
    shots = _shot_set(board)
    ships = _ship_sets(board)
    occupied = set().union(*ships)
    cells = [[UNKNOWN] * size for _ in range(size)]
    for r, c in shots:
        cells[r][c] = HIT if (r, c) in occupied else MISS
    remaining = []
    for ship in ships:
        if ship <= shots:
            for r, c in ship:
                cells[r][c] = SUNK
        else:
            remaining.append(len(ship))
    return {"size": size, "cells": cells, "remaining": sorted(remaining, reverse=True)}


def is_terminal(board: Board) -> bool:
    """True once every ship on ``board`` is sunk."""
    shots = _shot_set(board)
    return all(ship <= shots for ship in _ship_sets(board))


def legal_shots(view: View) -> list[Cell]:
    """Every not-yet-shot cell, in row-major order."""
    return [
        (r, c)
        for r, row in enumerate(view["cells"])
        for c, state in enumerate(row)
        if state == UNKNOWN
    ]


def is_legal_shot(view: View, shot: object) -> bool:
    cell = as_cell(shot)
    return (
        cell is not None
        and in_bounds(view["size"], cell)
        and view["cells"][cell[0]][cell[1]] == UNKNOWN
    )


def next_attacker(attacker: int, result: Result) -> int:
    """Who shoots next (players are 0 and 1): a hit or sink keeps the turn, a miss passes it."""
    return attacker if result["outcome"] != "miss" else 1 - attacker
