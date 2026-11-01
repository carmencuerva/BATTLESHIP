# Rules

## The game

- Each player has a square board, 10×10 by default. Rows and columns are numbered from 0.
- Each player places the same fleet. The default fleet has ship lengths **5, 4, 3, 3, 2**.
  Board size and fleet are configurable.
- Ships are straight lines, either horizontal or vertical. They must lie fully on the
  board. **They may not overlap or touch, not even diagonally.**
- Players take turns firing at one cell of the opponent's board:
    - **miss** (water): the turn passes to the opponent;
    - **hit**: you **shoot again**;
    - **sunk**: every cell of that ship has been hit. The **length** of the sunk ship is
      announced and you **shoot again**.
- Shooting the same cell twice, or a cell off the board, is illegal.
- The first player to sink the whole enemy fleet wins.

!!! note "Shooting first is an advantage"
    Because a hit lets you shoot again, the first shooter has an edge. The tournament
    therefore plays games in mirrored pairs: same fleets and seeds, and each player shoots
    first once.

## Data formats

All data is plain JSON-compatible Python: ints, strings, lists and dicts.

### Placement

A player returns one `[row, col, orientation]` per ship, **in fleet order**:

```python
[[0, 0, "H"], [2, 0, "H"], [4, 0, "H"], [6, 0, "H"], [8, 0, "H"]]
```

`(row, col)` is the ship's top-left cell. With `"H"` the ship extends to the right
(increasing column). With `"V"` it extends downwards (increasing row).

### View

When shooting, a bot receives the **attacker's view** of the enemy board. It never
receives more:

```python
{
    "size": 10,
    "cells": [[0, 0, 1, ...], ...],  # size × size
    "remaining": [5, 3, 2],          # lengths of the ships still afloat, longest first
}
```

| code | constant | meaning |
|-----:|----------|---------|
| 0 | `UNKNOWN` | not shot yet |
| 1 | `MISS` | water |
| 2 | `HIT` | hit, ship not sunk yet |
| 3 | `SUNK` | part of a sunk ship |

`remaining` follows from the "sunk announces its length" rule: whenever a ship sinks,
its length disappears from the list.

### Shot and result

A shot is `(row, col)` (a list works too). The engine answers with a result:

```python
{"outcome": "miss", "length": None}
{"outcome": "hit", "length": None}
{"outcome": "sunk", "length": 3}
```

## The engine

`battleship.game` holds the whole ruleset as pure functions, for example:

| function | what it does |
|----------|--------------|
| `validate_placement(size, fleet, placement)` | `None` if legal, else a reason (e.g. `"ship 1 touches ship 0 near [..]"`) |
| `random_placement(size, fleet, rng)` | a random legal placement |
| `new_board(size, fleet, placement)` | a board without shots |
| `apply_shot(board, shot)` | `(new_board, result)`; the input board is not modified |
| `view_for_attacker(board)` | the view described above |
| `legal_shots(view)`, `is_legal_shot(view, shot)` | the cells that can still be shot |
| `is_terminal(board)` | whether every ship is sunk |
| `next_attacker(attacker, result)` | who shoots next (the repeat-on-hit rule) |
