import numpy as np

def window_features(values: list[float]) -> dict:
    if not values:
        return {"mean": 0.0, "std": 0.0, "trend": 0.0, "max": 0.0}

    arr = np.asarray(values, dtype=float)

    mean = float(arr.mean())
    std = float(arr.std())
    maxv = float(arr.max())

    if len(arr) >= 2:
        x = np.arange(len(arr))
        trend = float(np.polyfit(x, arr, 1)[0])
    else:
        trend = 0.0

    return {
        "mean": mean,
        "std": std,
        "trend": trend,
        "max": maxv,
    }

def build_named_window(values: list[float], prefix: str) -> dict:
    """
    Converts a raw numeric series into ML-ready windowed features
    with stable, model-aligned column names.

    Example:
      prefix="motor_power"
      -> motor_power_mean, motor_power_std, motor_power_trend, motor_power_max
    """
    if not values:
        return {
            f"{prefix}_mean": 0.0,
            f"{prefix}_std": 0.0,
            f"{prefix}_trend": 0.0,
            f"{prefix}_max": 0.0,
        }

    w = window_features(values)

    return {
        f"{prefix}_mean": float(w["mean"]),
        f"{prefix}_std": float(w["std"]),
        f"{prefix}_trend": float(w["trend"]),
        f"{prefix}_max": float(w["max"]),
    }
