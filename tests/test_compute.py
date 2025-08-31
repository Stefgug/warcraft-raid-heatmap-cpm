from app.services.compute import aggregate_counts, compute_cpm, fight_minutes, min_max_positive


def test_fight_minutes():
    assert fight_minutes(1000, 61000) == 1.0
    assert fight_minutes(0, 0) == 0.0
    assert fight_minutes(2000, 1000) == 0.0


def test_aggregate_counts():
    ids = [1, 2, 2, 3, 3, 3]
    counts = aggregate_counts(ids)
    assert counts == {1: 1, 2: 2, 3: 3}


def test_compute_cpm_normal():
    counts = {1: 10, 2: 5}
    players = [1, 2, 3]
    cpm = compute_cpm(counts, players, minutes=5)
    assert cpm[1] == 2.0
    assert cpm[2] == 1.0
    assert cpm[3] == 0.0


def test_compute_cpm_zero_minutes():
    counts = {1: 10}
    players = [1, 2]
    cpm = compute_cpm(counts, players, minutes=0.0)
    assert cpm[1] == 0.0 and cpm[2] == 0.0


def test_min_max_positive():
    m, M = min_max_positive([0.0, 1.0, 2.0, 0.0])
    assert m == 1.0 and M == 2.0
    m, M = min_max_positive([0, 0, 0])
    assert m == 0.0 and M == 0.0

