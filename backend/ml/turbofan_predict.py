from __future__ import annotations

from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import math

MODEL_PATH = Path(__file__).resolve().parent / "models" / "turbofan_fd001_rf_rul.joblib"
_ART = None


def _load():
    global _ART
    if _ART is None:
        _ART = joblib.load(MODEL_PATH)
    return _ART

_ART = None

def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def predict_turbofan(row: dict) -> dict:
    art = _load()
    pipeline = art["pipeline"]
    feats = art["features"]

    X = pd.DataFrame([{f: row.get(f, None) for f in feats}])
    X = X.apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan)

    # keep it simple for now; later we can store medians in the artifact
    medians = art.get("medians", {})
    for f in feats:
        if X[f].isna().any():
            X[f] = X[f].fillna(medians.get(f, 0))

    rul = float(pipeline.predict(X)[0])
    if not np.isfinite(rul):
        rul = 0.0
    rul = max(0.0, rul)

    days = int(round(rul))

    # risk from RUL
    if days <= 15:
        risk = "critical"
    elif days <= 40:
        risk = "medium"
    else:
        risk = "low"

    # Convert days -> probFailure (sigmoid centered around 40 days)
    # days=40 -> ~0.5 ; days small -> near 1 ; days large -> near 0
    prob = float(_sigmoid((40.0 - days) / 10.0))

    # confidence heuristic (you already like this style)
    confidence = 0.7 + 0.25 * min(1.0, abs(prob - 0.5) / 0.4)

    return {
        "probFailure": prob,
        "daysToFailure": days,
        "riskLevel": risk,
        "confidence": float(confidence),
    }
