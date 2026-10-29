"""Elo ratings for the league format."""

from __future__ import annotations

import math

K = 32
INITIAL = 1500.0


def expected(rating_a: float, rating_b: float) -> float:
    """Probability that A beats B according to their ratings."""
    return 1.0 / (1.0 + math.pow(10.0, (rating_b - rating_a) / 400.0))


def update(rating_a: float, rating_b: float, score_a: float, k: float = K) -> tuple[float, float]:
    """New ratings after one game; ``score_a`` is 1 (A won), 0.5 (draw) or 0 (B won)."""
    delta = k * (score_a - expected(rating_a, rating_b))
    return rating_a + delta, rating_b - delta
