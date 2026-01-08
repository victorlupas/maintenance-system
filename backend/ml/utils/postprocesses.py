import math
import random


def spread_probability(p: float, machine_type: str) -> float:
    p = max(0.001, min(0.999, p))
    logit = math.log(p / (1 - p))

    if machine_type == "CNC":
        logit = logit * 0.6 + random.uniform(-0.6, 0.6)

    elif machine_type == "AC":
        logit = logit * 0.7 + random.uniform(-1.5, 1.5)

        # 🔥 KEY ADDITION: volatility floor for AC
        if p < 0.08:
            return random.uniform(0.08, 0.35)

    elif machine_type == "TE":
        logit = logit * 0.9 + random.uniform(-0.4, 0.4)

    p_adj = 1 / (1 + math.exp(-logit))
    return max(0.01, min(0.99, p_adj))


def risk_from_probability(p: float) -> str:
    if p >= 0.7:
        return "critical"
    elif p >= 0.3:
        return "medium"
    return "low"
