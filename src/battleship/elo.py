"""Elo-scale ratings for the league format, fitted to all the games at once.

The Elo model says that a player rated ``d`` points above another beats them with
probability ``1 / (1 + 10 ** (-d / 400))``. Updating ratings game by game (classic Elo)
makes the result depend on the order the games were played in: the last games weigh
most. Here the ratings are instead the ones that best explain every result together
(the maximum-likelihood fit of the same model, known as Bradley-Terry), so the order of
the games does not matter and, in a round robin, more points always means a higher rating.

To keep the ratings finite when a player wins or loses everything, each player also gets
one virtual draw against a 1500-rated reference. Ratings are then shifted so that their
mean is 1500.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence

INITIAL = 1500.0
SCALE = 400.0  # rating points for a factor of 10 in the odds of winning


def expected(rating_a: float, rating_b: float) -> float:
    """Probability that A beats B according to their ratings."""
    return 1.0 / (1.0 + math.pow(10.0, (rating_b - rating_a) / SCALE))


def fit(
    names: Sequence[str],
    results: Iterable[tuple[str, str, float]],
    iterations: int = 10_000,
    tolerance: float = 1e-10,
) -> dict[str, float]:
    """Ratings for ``names`` from ``results``: ``(a, b, score_a)`` with score 1, ½ or 0.

    Uses the minorisation-maximisation updates of Hunter (2004) for the Bradley-Terry
    model, where each player has a strength ``g`` and A beats B with ``g_a / (g_a + g_b)``.
    """
    index = {name: i for i, name in enumerate(names)}
    n = len(names)
    score = [0.5] * n  # the virtual draw against the reference
    games: dict[tuple[int, int], int] = {}
    for a, b, score_a in results:
        i, j = index[a], index[b]
        score[i] += score_a
        score[j] += 1.0 - score_a
        key = (min(i, j), max(i, j))
        games[key] = games.get(key, 0) + 1
    opponents: list[list[tuple[int, int]]] = [[] for _ in range(n)]
    for (i, j), count in games.items():
        opponents[i].append((j, count))
        opponents[j].append((i, count))

    strength = [1.0] * n
    for _ in range(iterations):
        new = []
        for i in range(n):
            # the reference has strength 1 and plays each player once
            denominator = 1.0 / (strength[i] + 1.0)
            denominator += sum(count / (strength[i] + strength[j]) for j, count in opponents[i])
            new.append(score[i] / denominator)
        change = max(abs(math.log(x / y)) for x, y in zip(new, strength, strict=True))
        strength = new
        if change < tolerance:
            break

    raw = [SCALE * math.log10(g) for g in strength]
    shift = INITIAL - sum(raw) / n if n else 0.0
    return {name: raw[index[name]] + shift for name in names}
