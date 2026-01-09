from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "train_FD001.txt"
OUT_DIR = Path(__file__).resolve().parent / "models"
OUT_DIR.mkdir(exist_ok=True)

MODEL_PATH = OUT_DIR / "turbofan_fd001_windowed.joblib"

FEATURES = [
    "temperature", "vibration", "pressure", "power",
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

    # Map to standardized feature names
    X = pd.DataFrame({
        "temperature": df["s1"] if "s1" in df.columns else 0.0,
        "vibration": df["s2"] if "s2" in df.columns else 0.0,
        "pressure": df["s3"] if "s3" in df.columns else 0.0,
        "power": df["op1"] if "op1" in df.columns else 0.0,
    })

    X = X.fillna(0.0).replace([np.inf, -np.inf], 0.0)
    y = df["RUL"].astype(float)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("reg", GradientBoostingRegressor(
            n_estimators=100,
            max_depth=4,
            random_state=42
        )),
    ])

    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    print("\n=== Turbofan (RUL) Model ===")
    print(f"MAE: {mean_absolute_error(y_test, y_pred):.2f} cycles")
    print(f"R2: {r2_score(y_test, y_pred):.4f}")

    joblib.dump(
        {
            "pipeline": model,
            "features": FEATURES,
        },
        MODEL_PATH,
    )

    print(f"Saved to {MODEL_PATH}")


if __name__ == "__main__":
    main()
