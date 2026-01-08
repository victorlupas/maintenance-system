from pathlib import Path
import pandas as pd
import joblib
import numpy as np
import math

from ml.utils.postprocesses import spread_probability, risk_from_probability

MODEL_PATH = Path(__file__).resolve().parent / "models" / "turbofan_fd001_windowed.joblib"
_ART = None


def _load():
    global _ART
    if _ART is None:
        _ART = joblib.load(MODEL_PATH)
    return _ART


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def predict_turbofan(row: dict) -> dict:
    art = _load()
    model = art["pipeline"]
    feats = art["features"]

    # Build input exactly as trained
    X = pd.DataFrame([{f: row.get(f, 0.0) for f in feats}])
    X = X.replace([np.inf, -np.inf], 0.0).fillna(0.0)

    # ✅ Predict Remaining Useful Life
    rul = float(model.predict(X)[0])
    days = max(int(round(rul)), 1)

    # ✅ Convert RUL → raw failure probability
    # (centered around ~60 days, smooth curve)
    raw_prob = _sigmoid((60 - days) / 12)

    # ✅ Single post-process step (TE profile)
    prob = spread_probability(raw_prob, machine_type="TE")

    return {
        "probFailure": round(prob, 3),
        "daysToFailure": days,
        "riskLevel": risk_from_probability(prob),
        "confidence": 0.95,
    }
