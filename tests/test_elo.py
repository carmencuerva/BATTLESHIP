import pytest

from battleship import elo


def test_expected_is_symmetric():
    assert elo.expected(1500, 1500) == 0.5
    assert elo.expected(1600, 1400) + elo.expected(1400, 1600) == pytest.approx(1.0)
    assert elo.expected(1600, 1400) > 0.5


@pytest.mark.parametrize("score", [0.0, 0.5, 1.0])
def test_update_conserves_total_rating(score):
    a, b = elo.update(1550, 1450, score)
    assert a + b == pytest.approx(3000)


def test_update_moves_ratings_by_k_times_surprise():
    assert elo.update(1500, 1500, 1.0) == (1516.0, 1484.0)
    assert elo.update(1500, 1500, 0.5) == (1500.0, 1500.0)
