from __future__ import annotations

from pathlib import Path
import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix
from sklearn.linear_model import LogisticRegression
import joblib

# Paths
BASE_DIR = Path(__file__).resolve().parents[1]   # backend/
DATA_DIR = BASE_DIR / "data"
OUT_DIR = Path(__file__).resolve().parent / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = DATA_DIR / "ai4i2020.csv"

TARGET = "Machine failure"

# Common useful features for this dataset
NUM_FEATURES = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
]
CAT_FEATURES = ["Type"]  # L / M / H


def main() -> None:
    print(f"Loading: {CSV_PATH}")
    df = pd.read_csv(CSV_PATH)

    print("\nShape:", df.shape)
    print("\nColumns:", list(df.columns))
    print("\nMissing values:\n", df.isna().sum().sort_values(ascending=False).head(10))

    if TARGET not in df.columns:
        raise RuntimeError(f"Target '{TARGET}' not found in CSV.")

    # Keep only existing features
    num_feats = [c for c in NUM_FEATURES if c in df.columns]
    cat_feats = [c for c in CAT_FEATURES if c in df.columns]

    X = df[num_feats + cat_feats].copy()
    y = df[TARGET].astype(int)

    print("\nTarget distribution:")
    print(y.value_counts(normalize=True).rename("ratio"))
    print("\nUsing numeric features:", num_feats)
    print("Using categorical features:", cat_feats)

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Preprocessing
    pre = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("scaler", StandardScaler())]), num_feats),
            ("cat", OneHotEncoder(handle_unknown="ignore"), cat_feats),
        ],
        remainder="drop",
    )

    # Simple baseline model
    clf = LogisticRegression(
        max_iter=2000,
        class_weight="balanced",  # helpful since failure is rare
        random_state=42,
    )

    pipe = Pipeline(steps=[("pre", pre), ("clf", clf)])
    pipe.fit(X_train, y_train)

    # Predictions
    y_pred = pipe.predict(X_test)
    y_proba = pipe.predict_proba(X_test)[:, 1]

    print("\n=== Milling (AI4I) results ===")
    print("Confusion matrix:\n", confusion_matrix(y_test, y_pred))
    print("\nClassification report:\n", classification_report(y_test, y_pred, digits=4))

    try:
        auc = roc_auc_score(y_test, y_proba)
        print(f"ROC AUC: {auc:.4f}")
    except Exception as e:
        print("ROC AUC failed:", e)

    # Save artifact (match predictor keys)
    artifact = {
        "model": pipe,
        "numeric_features": num_feats,
        "categorical_features": cat_feats,
        "threshold": 0.5,
        "target": TARGET,
        "notes": "LogisticRegression baseline classifier. class_weight=balanced.",
    }
    out_path = OUT_DIR / "milling_logreg.joblib"
    joblib.dump(artifact, out_path)
    print(f"\nSaved model artifact to: {out_path}")


if __name__ == "__main__":
    main()