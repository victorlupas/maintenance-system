from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "train_FD001.txt"
OUT_DIR = Path(__file__).resolve().parent / "models"
OUT_DIR.mkdir(exist_ok=True)

MODEL_PATH = OUT_DIR / "turbofan_fd001_windowed.joblib"

FEATURES = [
    "op1",
    "temp_mean", "temp_std", "temp_trend",
    "vib_mean", "vib_std", "vib_trend",
    "press_mean", "press_std",
]

def load_data(path):
    df = pd.read_csv(path, sep=r"\s+", header=None)
    df = df.dropna(axis=1, how="all")

    cols = ["unit", "cycle", "op1", "op2", "op3"] + [f"s{i}" for i in range(1, df.shape[1]-4)]
    df.columns = cols
    return df

def main():
    df = load_data(DATA_PATH)

    max_cycle = df.groupby("unit")["cycle"].max()
    df["RUL"] = max_cycle[df["unit"]].values - df["cycle"]

    X = pd.DataFrame({
        "op1": df["op1"],
        "temp_mean": df["s1"],
        "temp_std": 0.0,
        "temp_trend": 0.0,
        "vib_mean": df["s2"],
        "vib_std": 0.0,
        "vib_trend": 0.0,
        "press_mean": df["s3"],
        "press_std": 0.0,
    })

    X = X.fillna(X.median())
    y = df["RUL"].astype(float)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("rf", RandomForestRegressor(n_estimators=300, n_jobs=-1)),
    ])

    model.fit(X_train, y_train)

    joblib.dump(
        {
            "pipeline": model,
            "features": FEATURES,
        },
        MODEL_PATH,
    )

    print("✅ Saved:", MODEL_PATH)

if __name__ == "__main__":
    main()
