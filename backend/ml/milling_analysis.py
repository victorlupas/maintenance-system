from __future__ import annotations

from pathlib import Path
import numpy as np
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import classification_report, roc_auc_score

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "ai4i2020.csv"
OUT_DIR = Path(__file__).resolve().parent / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = OUT_DIR / "milling_windowed.joblib"

FEATURES = [
    "temperature", "vibration", "pressure", "power",
]

TARGET = "Machine failure"


def main():
    df = pd.read_csv(DATA_PATH)
    df = df.dropna(subset=[TARGET])

    # Map to standardized feature names
    X = pd.DataFrame({
        "temperature": (df["Air temperature [K]"] - 273.15) if "Air temperature [K]" in df.columns else 25.0,
        "vibration": df["Torque [Nm]"] / 20.0 if "Torque [Nm]" in df.columns else 0.0,
        "pressure": df["Rotational speed [rpm]"] / 30.0 if "Rotational speed [rpm]" in df.columns else 0.0,
        "power": df["Tool wear [min]"] if "Tool wear [min]" in df.columns else 0.0,
    })

    y = df[TARGET].astype(int)

    X = X.fillna(0.0).replace([np.inf, -np.inf], 0.0)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingClassifier(
            n_estimators=100,
            max_depth=4,
            random_state=42
        )),
    ])

    model.fit(X_train, y_train)

    y_prob = model.predict_proba(X_test)[:, 1]
    print("\n=== Milling (CNC) Model ===")
    print(classification_report(y_test, (y_prob > 0.5).astype(int), digits=4))
    print("ROC AUC:", roc_auc_score(y_test, y_prob))

    joblib.dump(
        {
            "model": model,
            "features": FEATURES,
        },
        MODEL_PATH,
    )

    print(f"Saved to {MODEL_PATH}")


if __name__ == "__main__":
    main()
