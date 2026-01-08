from pathlib import Path
import joblib
import pandas as pd
import numpy as np

from ml.utils.postprocesses import spread_probability, risk_from_probability

MODEL_PATH = Path(__file__).resolve().parent / "models" / "milling_windowed.joblib"
_ART = None


def _load():
    global _ART
    if _ART is None:
        _ART = joblib.load(MODEL_PATH)
    return _ART


def predict_milling(row: dict) -> dict:
    art = _load()
    model = art["model"]

    X = pd.DataFrame([row])
    X = X.replace([np.inf, -np.inf], 0.0).fillna(0.0)

    # ✅ Raw ML output
    raw_prob = float(model.predict_proba(X)[0, 1])

    # 🔍 DEBUG: Print to see what the model actually outputs
    print(f"🔍 Milling RAW prob: {raw_prob:.4f}")

    # ✅ Use the same post-processing as other machines
    prob = spread_probability(raw_prob, machine_type="CNC")

    return {
        "probFailure": round(prob, 3),
        "riskLevel": risk_from_probability(prob),
        "confidence": 0.85,  # Higher confidence for CNC since they're well-monitored
    }