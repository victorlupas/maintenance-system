from __future__ import annotations

from pathlib import Path
import numpy as np
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "ai4i2020.csv"
OUT_DIR = Path(__file__).resolve().parent / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = OUT_DIR / "milling_windowed.joblib"
WINDOW = 10

NUM = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
]
CAT = ["Type"]
TARGET = "Machine failure"


def trend(x: np.ndarray) -> float:
    if len(x) < 2:
        return 0.0
    return np.polyfit(range(len(x)), x, 1)[0]


def make_window_features(df: pd.DataFrame, window: int) -> pd.DataFrame:
    rows = []
    for i in range(window, len(df)):
        win = df.iloc[i - window:i]
        row = {}
        for c in NUM:
            s = win[c].astype(float)
            row[f"{c}_mean"] = s.mean()
            row[f"{c}_std"] = s.std()
            row[f"{c}_trend"] = trend(s.values)
        row["Type"] = win.iloc[-1]["Type"]
        row[TARGET] = df.iloc[i][TARGET]
        rows.append(row)
    return pd.DataFrame(rows)


def main():
    df = pd.read_csv(DATA_PATH)
    df = df.dropna(subset=NUM + CAT + [TARGET])

    win_df = make_window_features(df, WINDOW)

    X = win_df.drop(columns=[TARGET])
    y = win_df[TARGET].astype(int)

    pre = ColumnTransformer([
        ("num", StandardScaler(), [c for c in X.columns if c != "Type"]),
        ("cat", OneHotEncoder(handle_unknown="ignore"), ["Type"]),
    ])

    pipe = Pipeline([
        ("pre", pre),
        ("clf", LogisticRegression(max_iter=2000, class_weight="balanced"))
    ])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipe.fit(X_train, y_train)
    y_pred = pipe.predict(X_test)
    y_prob = pipe.predict_proba(X_test)[:, 1]

    print("\n=== Milling (Windowed) ===")
    print(confusion_matrix(y_test, y_pred))
    print(classification_report(y_test, y_pred, digits=4))
    print("ROC AUC:", roc_auc_score(y_test, y_prob))

    artifact = {
        "model": pipe,
        "features": X.columns.tolist(),
        "window": WINDOW,
        "threshold": 0.5,
    }

    joblib.dump(artifact, MODEL_PATH)
    print(f"Saved to {MODEL_PATH}")


if __name__ == "__main__":
    main()
