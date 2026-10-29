"""The contract every Battleship player implements.

A player only ever sees plain data: the board size and fleet when placing ships, and the
attacker's ``view`` (see ``battleship.game``) when shooting. It never sees the opponent's
board. Turns, time budgets and forfeits are the tournament's business, not the player's.

Minimal example::

    class MyBot(Player):
        @classmethod
        def get_name(cls) -> str:
            return "mybot"

        @classmethod
        def get_authors(cls) -> list[str]:
            return ["Ada Lovelace"]

        def choose_placement(self, board_size, fleet):
            return [[2 * i, 0, "H"] for i in range(len(fleet))]

        def choose_shot(self, view):
            return legal_shots(view)[0]
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Any

from battleship.game import View


class Player(ABC):
    """Base class for all players. Subclass it and implement the abstract methods."""

    #: Optional, for the web's "X-ray" mode: anything JSON-serialisable explaining the last
    #: shot (e.g. ``{"heatmap": [[...], ...]}``). Ignored by the tournament.
    last_info: dict[str, Any] | None = None

    # --- identity: readable without constructing the player ----------------------------

    @classmethod
    @abstractmethod
    def get_name(cls) -> str:
        """Unique, short display name, e.g. ``"hard"``."""

    @classmethod
    @abstractmethod
    def get_authors(cls) -> list[str]:
        """Non-empty list of author names."""

    @classmethod
    def get_description(cls) -> str:
        """One-line strategy summary."""
        return ""

    @classmethod
    def get_icon(cls) -> str:
        """A single emoji."""
        return "🚢"

    # --- construction --------------------------------------------------------------------

    @classmethod
    def create(cls, seed: int) -> Player:
        """The only way the tournament builds a player. Override to use ``seed`` for
        reproducible randomness; the default ignores it."""
        return cls()

    # --- play ----------------------------------------------------------------------------

    @abstractmethod
    def choose_placement(self, board_size: int, fleet: Sequence[int]) -> list[Any]:
        """Return one ``[row, col, "H"|"V"]`` per ship, in ``fleet`` order.

        Ships must lie on the board and may not overlap or touch, even diagonally.
        """

    @abstractmethod
    def choose_shot(self, view: View) -> tuple[int, int]:
        """Return a ``(row, col)`` that is on the board and not shot before."""
