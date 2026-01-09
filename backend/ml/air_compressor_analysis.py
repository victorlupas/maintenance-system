from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import classification_report, roc_auc_score

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "air_compressor.csv"
OUT_DIR = Path(__file__).resolve().parent / "models"
OUT_DIR.mkdir(exist_ok=True)

MODEL_PATH = OUT_DIR / "air_compressor_windowed.joblib"

FEATURES = [
    "temperature", "vibration", "pressure", "power",
]


def build_target(df: pd.DataFrame) -> pd.Series:
    """
    Create fault labels based on sensor thresholds.
    High temperature, vibration, or pressure indicates potential failure.
    Uses a combined score approach to ensure balanced classes.
    """
    # Create a risk score based on normalized sensor values
    scores = np.zeros(len(df))
    
    if "outlet_temp" in df.columns:
        temp = df["outlet_temp"]
        scores += (temp - temp.min()) / (temp.max() - temp.min() + 1e-6)
    
    if "haccz" in df.columns:
        vib = df["haccz"]
        scores += (vib - vib.min()) / (vib.max() - vib.min() + 1e-6)
    
    if "outlet_pressure_bar" in df.columns:
        press = df["outlet_pressure_bar"]
        scores += (press - press.min()) / (press.max() - press.min() + 1e-6)
    
    # Label top 40% as potential failures (high risk)
    threshold = np.percentile(scores, 60)
    fault = (scores > threshold).astype(int)
    
    return pd.Series(fault, name="fault")


def main():
    df = pd.read_csv(DATA_PATH)
    y = build_target(df)

    # Map raw columns to standardized feature names
    X = pd.DataFrame({
        "temperature": df["outlet_temp"] if "outlet_temp" in df.columns else 0.0,
        "vibration": df["haccz"] if "haccz" in df.columns else 0.0,
        "pressure": df["outlet_pressure_bar"] if "outlet_pressure_bar" in df.columns else 0.0,
        "power": df["motor_power"] if "motor_power" in df.columns else 0.0,
    })

    X = X.fillna(0.0).replace([np.inf, -np.inf], 0.0)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
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
    print("\n=== Air Compressor Model ===")
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
