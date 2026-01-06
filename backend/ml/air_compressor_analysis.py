from __future__ import annotations

from pathlib import Path
import joblib
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV

BASE_DIR = Path(__file__).resolve().parents[1]  # backend/
DATA_PATH = BASE_DIR / "data" / "air_compressor.csv"
MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = MODEL_DIR / "air_compressor_calibrated.joblib"

NORMALS = {
    "bearings": "Ok",
    "wpump": "Ok",
    "radiator": "Clean",
    "exvalve": "Clean",
    "acmotor": "Stable",
}

def build_target(df: pd.DataFrame) -> pd.Series:
    fault = np.zeros(len(df), dtype=int)
    for col, normal in NORMALS.items():
        fault |= (df[col].astype(str).str.strip() != normal).astype(int).to_numpy()
    return pd.Series(fault, name="fault")

def main() -> None:
    print(f"Loading: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH)

    y = build_target(df)

    numeric_features = [
        "rpm","motor_power","torque","outlet_pressure_bar","air_flow","noise_db",
        "outlet_temp","wpump_outlet_press","water_inlet_temp","water_outlet_temp",
        "wpump_power","water_flow","oilpump_power","oil_tank_temp",
        "gaccx","gaccy","gaccz","haccx","haccy","haccz",
    ]

    X = df[numeric_features].copy()
    for c in numeric_features:
        X[c] = pd.to_numeric(X[c], errors="coerce")

    # IMPORTANT: handle NaNs consistently
    X = X.fillna(X.median(numeric_only=True))

    # Split into train/test first
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Base pipeline (uncalibrated)
    base = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=2000, class_weight="balanced")),
        ]
    )

    # Calibrated model:
    # - method="sigmoid" = Platt scaling (usually stable for small-ish datasets)
    # - cv=5 does calibration folds on training set
    calibrated = CalibratedClassifierCV(base, method="sigmoid", cv=5)

    calibrated.fit(X_train, y_train)

    proba = calibrated.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)

    print("\n=== Air Compressor (Calibrated) results ===")
    print("Confusion matrix:\n", confusion_matrix(y_test, pred))
    print("\nClassification report:\n", classification_report(y_test, pred, digits=4))
    try:
        auc = roc_auc_score(y_test, proba)
        print(f"ROC AUC: {auc:.4f}")
    except Exception:
        pass

    artifact = {
        "model": calibrated,
        "numeric_features": numeric_features,
        "threshold": 0.5,
    }
    joblib.dump(artifact, MODEL_PATH)
    print(f"\nSaved model artifact to: {MODEL_PATH}")

if __name__ == "__main__":
    main()