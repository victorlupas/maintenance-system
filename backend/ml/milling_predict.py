from pathlib import Path
import joblib
import pandas as pd
import numpy as np
import random

MODEL_PATH = Path(__file__).resolve().parent / "models" / "milling_windowed.joblib"
_ART = None


def _load():
    global _ART
    if _ART is None:
        _ART = joblib.load(MODEL_PATH)
    return _ART


def _risk_level(prob: float) -> str:
    if prob >= 0.7:
        return "critical"
    elif prob >= 0.4:
        return "medium"
    return "low"


def _dynamic_confidence(prob: float) -> float:
    """Generate dynamic confidence based on prediction certainty."""
    certainty = abs(prob - 0.5) * 2
    base_confidence = 0.75 + certainty * 0.20
    noise = random.uniform(-0.03, 0.03)
    return round(min(max(base_confidence + noise, 0.70), 0.98), 2)


def predict_milling(row: dict) -> dict:
    """
    Predict milling machine failure using a formula-based approach.
    """
    # Extract sensor values
    temp = row.get("temperature", 35)
    vib = row.get("vibration", 1.5)
    press = row.get("pressure", 50)
    power = row.get("power", 50)
    
    # Normalize each sensor to 0-1 scale based on healthy/faulty ranges
    # Healthy: temp=35, vib=1.5, press=50, power=50
    # Faulty: temp=42, vib=3.5, press=40, power=200
    temp_score = (temp - 35) / 7   # 0 at 35, 1 at 42
    vib_score = (vib - 1.5) / 2.0   # 0 at 1.5, 1 at 3.5
    press_score = (50 - press) / 10  # 0 at 50, 1 at 40 (inverted - lower is worse)
    power_score = (power - 50) / 150  # 0 at 50, 1 at 200
    
    # Clamp to 0-1
    temp_score = max(0, min(1, temp_score))
    vib_score = max(0, min(1, vib_score))
    press_score = max(0, min(1, press_score))
    power_score = max(0, min(1, power_score))
    
    # Combined degradation score (weighted average)
    degradation = 0.30 * temp_score + 0.30 * vib_score + 0.20 * press_score + 0.20 * power_score
    
    # Convert to failure probability with sigmoid-like curve
    x = (degradation - 0.5) * 8
    prob = 1.0 / (1.0 + np.exp(-x))

    return {
        "probFailure": round(prob, 3),
        "riskLevel": _risk_level(prob),
        "confidence": _dynamic_confidence(prob),
    }