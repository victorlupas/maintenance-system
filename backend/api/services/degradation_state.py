from __future__ import annotations
import random
from datetime import datetime

# Persistent in-memory health state per machine
# (good enough for demo; resets on backend restart)
_STATE: dict[str, float] = {}

def update_health(machine_id: str) -> float:
    if machine_id not in _STATE:
        _STATE[machine_id] = random.uniform(0.7, 1.0)

    # 🔥 MUCH stronger dynamics
    degradation = random.uniform(0.002, 0.01)
    noise = random.uniform(-0.01, 0.01)

    # occasional recovery event (maintenance / lucky cycle)
    if random.random() < 0.05:
        noise += random.uniform(0.05, 0.12)

    _STATE[machine_id] = max(
        0.05,
        min(1.0, _STATE[machine_id] - degradation + noise)
    )

    return _STATE[machine_id]

