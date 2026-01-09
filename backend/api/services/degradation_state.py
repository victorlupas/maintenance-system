from __future__ import annotations
import random
from datetime import datetime

# Persistent in-memory health state per machine
# (good enough for demo; resets on backend restart)
_STATE: dict[str, float] = {}

def update_health(machine_id: str) -> float:
    """
    Update and return health for a machine.
    Health ranges from 0.0 (failing) to 1.0 (healthy).
    
    Risk distribution target:
    - Critical (health < 0.3): ~10% of machines (rare)
    - Medium (health 0.3-0.6): ~25% of machines (uncommon)
    - Low (health > 0.6): ~65% of machines (common)
    
    Health is mostly STABLE with small random fluctuations.
    This prevents all machines from drifting to critical over time.
    """
    if machine_id not in _STATE:
        # Initialize with weighted distribution favoring healthy
        roll = random.random()
        if roll < 0.65:
            # Low risk - healthy machines (65%)
            _STATE[machine_id] = random.uniform(0.65, 0.95)
        elif roll < 0.90:
            # Medium risk (25%)
            _STATE[machine_id] = random.uniform(0.35, 0.60)
        else:
            # Critical risk - rare (10%)
            _STATE[machine_id] = random.uniform(0.05, 0.30)

    # Small random fluctuation around current health (mostly stable)
    # Net change is zero on average to prevent drift
    fluctuation = random.uniform(-0.02, 0.02)
    
    # Rare events (5% chance each):
    # - Sudden degradation (equipment issue)
    # - Recovery (maintenance performed)
    event_roll = random.random()
    if event_roll < 0.05:
        # Degradation event
        fluctuation -= random.uniform(0.05, 0.15)
    elif event_roll > 0.95:
        # Recovery event
        fluctuation += random.uniform(0.05, 0.15)

    _STATE[machine_id] = max(
        0.05,
        min(0.95, _STATE[machine_id] + fluctuation)
    )

    return _STATE[machine_id]

