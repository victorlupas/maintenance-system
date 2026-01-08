from pathlib import Path
import pandas as pd
import joblib
import numpy as np

from ml.utils.postprocesses import spread_probability, risk_from_probability

MODEL_PATH = Path(__file__).resolve().parent / "models" / "air_compressor_windowed.joblib"
_ART = None


def _load():
    global _ART
    if _ART is None:
        _ART = joblib.load(MODEL_PATH)
    return _ART


def predict_air_compressor(row: dict) -> dict:
    art = _load()
    model = art["model"]
    feats = art["features"]

    X = pd.DataFrame([{f: row.get(f, 0.0) for f in feats}])
    X = X.replace([np.inf, -np.inf], 0.0).fillna(0.0)

    # ✅ Raw ML output ONLY
    raw_prob = float(model.predict_proba(X)[0, 1])

    # ✅ Single post-process step
    prob = spread_probability(raw_prob, machine_type="AC")

    return {
        "probFailure": round(prob, 3),
        "riskLevel": risk_from_probability(prob),
        "confidence": 0.95,
    }
