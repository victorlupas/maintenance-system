from __future__ import annotations

from pathlib import Path
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
import joblib

BASE_DIR = Path(__file__).resolve().parents[1]  # backend/
DATA_DIR = BASE_DIR / "data"
OUT_DIR = Path(__file__).resolve().parent / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)

TRAIN_PATH = DATA_DIR / "train_FD001.txt"


def load_train_fd001_txt(path: Path) -> pd.DataFrame:
    """
    CMAPSS train_FD001.txt format (whitespace separated, no header):
      unit, cycle, op1, op2, op3, s1..s21  (26 cols total)
    Some files include trailing empty columns; we handle that.
    """
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")

    df = pd.read_csv(path, sep=r"\s+", header=None, engine="python")

    # Drop any all-NaN columns (happens if extra spaces)
    df = df.dropna(axis=1, how="all")

    # Expected columns: 2 identifiers + 3 ops + sensors
    base_cols = ["unit", "cycle", "op1", "op2", "op3"]
    sensor_count = df.shape[1] - len(base_cols)
    if sensor_count <= 0:
        raise RuntimeError(f"Unexpected column count {df.shape[1]} in {path.name}")

    cols = base_cols + [f"s{i}" for i in range(1, sensor_count + 1)]
    df.columns = cols
    return df


def add_rul(df: pd.DataFrame) -> pd.DataFrame:
    """
    RUL label per row: max_cycle_per_unit - cycle
    """
    max_cycle = df.groupby("unit")["cycle"].max().rename("max_cycle")
    df = df.join(max_cycle, on="unit")
    df["RUL"] = df["max_cycle"] - df["cycle"]
    df = df.drop(columns=["max_cycle"])
    return df


def main() -> None:
    print(f"Loading: {TRAIN_PATH}")
    df = load_train_fd001_txt(TRAIN_PATH)

    print("\nShape:", df.shape)
    print("Columns:", df.columns.tolist()[:15], ("..." if len(df.columns) > 15 else ""))

    # Basic exploration
    print("\nUnits:", df["unit"].nunique())
    print("Cycle range:", (df["cycle"].min(), df["cycle"].max()))
    print("\nMissing values (top):")
    print(df.isna().sum().sort_values(ascending=False).head(10))

    # Create RUL label
    df = add_rul(df)

    print("\nRUL describe:")
    print(df["RUL"].describe())

    # Feature selection: numeric columns excluding identifiers + label
    drop = {"unit", "cycle", "RUL"}
    features = ["op1", "op2", "op3", "s1", "s2", "s3"]
    if not features:
        raise RuntimeError("No numeric features found.")

    X = df[features].replace([np.inf, -np.inf], np.nan).dropna()
    y = df.loc[X.index, "RUL"].astype(float)

    print("\nUsing feature count:", len(features))
    print("Example features:", features[:10])
    medians = X.median(numeric_only=True).to_dict()

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # Baseline regression model
    model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("rf", RandomForestRegressor(
                n_estimators=300,
                random_state=42,
                n_jobs=-1
            )),
        ]
    )

    model.fit(X_train, y_train)
    pred = model.predict(X_test)

    mae = mean_absolute_error(y_test, pred)
    rmse = mean_squared_error(y_test, pred) ** 0.5

    print("\n=== Turbofan FD001 RUL baseline ===")
    print(f"MAE:  {mae:.3f}")
    print(f"RMSE: {rmse:.3f}")

    # Save artifact
    artifact = {
        "pipeline": model,
        "features": features,
        "medians": medians,
        "label": "RUL",
        "source_file": TRAIN_PATH.name,
        "notes": "RandomForest baseline. Label is RUL = max_cycle(unit)-cycle.",
    }
    out_path = OUT_DIR / "turbofan_fd001_rf_rul.joblib"
    joblib.dump(artifact, out_path)
    print(f"\nSaved model artifact to: {out_path}")


if __name__ == "__main__":
    main()
