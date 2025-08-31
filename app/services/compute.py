from __future__ import annotations

from collections import Counter
from typing import Iterable


def fight_minutes(start_time: int, end_time: int) -> float:
    delta_ms = max(0, end_time - start_time)
    return delta_ms / 60000.0


def aggregate_counts(target_ids: Iterable[int]) -> dict[int, int]:
    counter: Counter[int] = Counter(target_ids)
    return dict(counter)


def compute_cpm(
    counts_by_target: dict[int, int],
    all_player_ids: Iterable[int],
    minutes: float,
) -> dict[int, float]:
    if minutes <= 0:
        # Avoid division by zero; consider all CPM as 0.
        return {pid: 0.0 for pid in all_player_ids}

    result: dict[int, float] = {}
    for pid in all_player_ids:
        count = counts_by_target.get(pid, 0)
        result[pid] = count / minutes
    return result


def min_max_positive(values: Iterable[float]) -> tuple[float, float]:
    positives = [v for v in values if v > 0]
    if not positives:
        return 0.0, 0.0
    return min(positives), max(positives)

