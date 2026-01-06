from __future__ import annotations

from pathlib import Path
import joblib
import numpy as np
import pandas as pd

MODEL_PATH = Path(__file__).resolve().parent / "models" / "milling_logreg.joblib"
_ART = None


def _load():
    global _ART
    if _ART is None:
        _ART = joblib.load(MODEL_PATH)
    return _ART


def predict_milling(row: dict) -> dict:
    art = _load()

    # Your milling_analysis saves {"pipeline": pipe, "num_features": ..., "cat_features": ...}
    if isinstance(art, dict):
        model = art.get("pipeline") or art.get("model")  # support both just in case
        if model is None:
            raise KeyError(f"Model artifact keys are: {list(art.keys())} (expected 'pipeline')")

        num_feats = art.get(
            "num_features",
            [
                "Air temperature [K]",
                "Process temperature [K]",
                "Rotational speed [rpm]",
                "Torque [Nm]",
                "Tool wear [min]",
            ],
        )
        cat_feats = art.get("cat_features", ["Type"])
    else:
        # If you accidentally saved just the pipeline
        model = art
        num_feats = [
            "Air temperature [K]",
            "Process temperature [K]",
            "Rotational speed [rpm]",
            "Torque [Nm]",
            "Tool wear [min]",
        ]
        cat_feats = ["Type"]

    # Build one-row dataframe with the exact columns the pipeline expects
    record = {c: row.get(c, None) for c in (num_feats + cat_feats)}
    X = pd.DataFrame([record])

    # Clean numeric cols
    for c in num_feats:
        X[c] = pd.to_numeric(X[c], errors="coerce")
    X = X.replace([np.inf, -np.inf], np.nan)

    # Ensure Type is valid so OneHotEncoder behaves consistently
    if "Type" in X.columns:
        v = str(X.loc[0, "Type"]).strip()
        if v not in ("L", "M", "H"):
            X.loc[0, "Type"] = "M"

    # IMPORTANT: your pipeline DOES NOT necessarily include an imputer
    # so we must eliminate NaNs here.
    defaults = {
        "Air temperature [K]": 300.0,
        "Process temperature [K]": 310.0,
        "Rotational speed [rpm]": 1500.0,
        "Torque [Nm]": 40.0,
        "Tool wear [min]": 0.0,
    }
    for c in num_feats:
        if X[c].isna().any():
            X[c] = X[c].fillna(defaults.get(c, 0.0))

    prob = float(model.predict_proba(X)[0, 1])

    if prob >= 0.7:
        risk = "critical"
    elif prob >= 0.4:
        risk = "medium"
    else:
        risk = "low"

    confidence = 0.7 + 0.25 * min(1.0, abs(prob - 0.5) / 0.4)

    return {
        "probFailure": prob,
        "riskLevel": risk,
        "confidence": float(confidence),
    }