"""Reusable strategies. Players in ``players/`` are thin wrappers that name one of these.

Strategies are plain functions of plain data (plus a ``random.Random`` where they need
randomness), so they are easy to test and to combine.
"""

from battleship.bots.placement import random_fleet, stealth_fleet
from battleship.bots.shooting import (
    hit_clusters,
    hunt_target_shot,
    probability_map,
    probability_shot,
    random_shot,
    scan_shot,
)

__all__ = [
    "hit_clusters",
    "hunt_target_shot",
    "probability_map",
    "probability_shot",
    "random_fleet",
    "random_shot",
    "scan_shot",
    "stealth_fleet",
]
