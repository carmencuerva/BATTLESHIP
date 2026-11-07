import math
import random

import pytest

from battleship import elo


def test_expected_is_symmetric():
    assert elo.expected(1500, 1500) == 0.5
    assert elo.expected(1600, 1400) + elo.expected(1400, 1600) == pytest.approx(1.0)
    assert elo.expected(1600, 1400) > 0.5


def series(a, b, wins_a, wins_b):
    return [(a, b, 1.0)] * wins_a + [(a, b, 0.0)] * wins_b


def test_fit_does_not_depend_on_the_order_of_the_games():
    games = series("x", "y", 70, 30) + series("x", "z", 90, 10) + series("y", "z", 60, 40)
    first = elo.fit(["x", "y", "z"], games)
    for seed in range(5):
        shuffled = games[:]
        random.Random(seed).shuffle(shuffled)
        again = elo.fit(["x", "y", "z"], shuffled)
        assert again == pytest.approx(first, abs=1e-6)


def test_fit_follows_the_model_and_centres_on_1500():
    ratings = elo.fit(["a", "b"], series("a", "b", 750, 250))
    # 75% wins is 400 * log10(3) = 190.8 points; the two virtual draws pull a hair closer
    assert ratings["a"] - ratings["b"] == pytest.approx(400 * math.log10(3), abs=1.0)
    assert sum(ratings.values()) == pytest.approx(2 * elo.INITIAL)
    assert elo.expected(ratings["a"], ratings["b"]) == pytest.approx(0.75, abs=0.005)


def test_more_points_means_a_higher_rating_in_a_round_robin():
    # The case that order-dependent Elo got wrong: "l" beats "h" head to head and has
    # more points overall, so it must be rated higher whatever the schedule.
    games = (
        series("h", "l", 30, 70)
        + series("h", "m", 70, 30)
        + series("l", "m", 81, 19)
        + series("h", "r", 100, 0)
        + series("l", "r", 100, 0)
        + series("m", "r", 100, 0)
    )
    ratings = elo.fit(["h", "l", "m", "r"], games)
    assert ratings["l"] > ratings["h"] > ratings["m"] > ratings["r"]


def test_a_clean_sweep_stays_finite_and_draws_count_half():
    ratings = elo.fit(["a", "b"], series("a", "b", 20, 0))
    assert all(math.isfinite(r) for r in ratings.values())
    assert ratings["a"] > ratings["b"]
    level = elo.fit(["a", "b"], [("a", "b", 0.5)] * 10)
    assert level["a"] == pytest.approx(level["b"])
