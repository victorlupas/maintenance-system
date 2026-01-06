from __future__ import annotations

from pathlib import Path
import joblib
import numpy as np
import pandas as pd

MODEL_PATH = Path(__file__).resolve().parent / "models" / "air_compressor_logreg.joblib"
_ART = None


def _load():
    global _ART
    if _ART is None:
        _ART = joblib.load(MODEL_PATH)
    return _ART


def predict_air_compressor(row: dict) -> dict:
    art = _load()
    model = art["model"]
    feats = art["numeric_features"]

    # Build a single-row dataframe with the expected columns
    X = pd.DataFrame([{f: row.get(f, None) for f in feats}])

    # Convert to numeric; bad strings -> NaN (pipeline imputer will handle)
    for f in feats:
        X[f] = pd.to_numeric(X[f], errors="coerce")

    # Safety: convert +/-inf to NaN too
    X = X.replace([np.inf, -np.inf], np.nan)

    # Predict (imputer in pipeline prevents NaN crash)
    prob = float(model.predict_proba(X)[0, 1])

    if prob >= 0.7:
        risk = "critical"
    elif prob >= 0.4:
        risk = "medium"
    else:
        risk = "low"

    return {
        "probFailure": prob,
        "riskLevel": risk,
        "confidence": 0.7 + 0.25 * min(1.0, abs(prob - 0.5) / 0.4),
    }