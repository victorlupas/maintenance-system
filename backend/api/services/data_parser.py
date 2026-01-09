"""
Service for parsing uploaded data logs (CSV/JSON) and extracting ML features.
"""
import json
import pandas as pd
import numpy as np
from io import StringIO


# Expected column mappings for each machine type
COLUMN_MAPPINGS = {
    "AC": {
        "temperature": ["temperature", "temp", "outlet_temp", "motor_temp"],
        "vibration": ["vibration", "vib", "haccz", "acceleration"],
        "pressure": ["pressure", "press", "outlet_pressure", "outlet_pressure_bar"],
        "power": ["power", "power_consumption", "motor_power", "watt"],
    },
    "CNC": {
        "temperature": ["temperature", "temp", "air_temperature", "process_temperature", "Air temperature [K]", "Process temperature [K]"],
        "vibration": ["vibration", "vib", "torque", "Torque [Nm]"],
        "pressure": ["pressure", "press", "rotational_speed", "Rotational speed [rpm]"],
        "power": ["power", "power_consumption", "tool_wear", "Tool wear [min]"],
    },
    "TE": {
        "temperature": ["temperature", "temp", "s1"],
        "vibration": ["vibration", "vib", "s2"],
        "pressure": ["pressure", "press", "s3"],
        "power": ["power", "power_consumption", "op1"],
    },
}


def find_column(df_columns: list, candidates: list) -> str | None:
    """Find the first matching column name from candidates."""
    df_cols_lower = {c.lower(): c for c in df_columns}
    for candidate in candidates:
        if candidate.lower() in df_cols_lower:
            return df_cols_lower[candidate.lower()]
    return None


def parse_csv(file_content: str) -> pd.DataFrame:
    """Parse CSV content into DataFrame."""
    return pd.read_csv(StringIO(file_content))


def parse_json(file_content: str) -> pd.DataFrame:
    """Parse JSON content into DataFrame."""
    data = json.loads(file_content)
    if isinstance(data, list):
        return pd.DataFrame(data)
    elif isinstance(data, dict):
        if "data" in data:
            return pd.DataFrame(data["data"])
        elif "sensorData" in data:
            return pd.DataFrame(data["sensorData"])
        else:
            return pd.DataFrame([data])
    return pd.DataFrame()


def parse_uploaded_file(file_content: str, filename: str) -> pd.DataFrame:
    """Parse uploaded file based on extension."""
    filename_lower = filename.lower()
    if filename_lower.endswith(".csv"):
        return parse_csv(file_content)
    elif filename_lower.endswith(".json"):
        return parse_json(file_content)
    else:
        raise ValueError(f"Unsupported file format: {filename}. Use CSV or JSON.")


def extract_sensor_data(df: pd.DataFrame, machine_type: str) -> list[dict]:
    """
    Extract and normalize sensor readings from uploaded data.
    Returns list of dicts with standardized keys: temperature, vibration, pressure, powerConsumption
    """
    mappings = COLUMN_MAPPINGS.get(machine_type, COLUMN_MAPPINGS["AC"])
    
    temp_col = find_column(df.columns.tolist(), mappings["temperature"])
    vib_col = find_column(df.columns.tolist(), mappings["vibration"])
    press_col = find_column(df.columns.tolist(), mappings["pressure"])
    power_col = find_column(df.columns.tolist(), mappings["power"])
    
    rows = []
    for _, row in df.iterrows():
        rows.append({
            "temperature": float(row[temp_col]) if temp_col and pd.notna(row.get(temp_col)) else 0.0,
            "vibration": float(row[vib_col]) if vib_col and pd.notna(row.get(vib_col)) else 0.0,
            "pressure": float(row[press_col]) if press_col and pd.notna(row.get(press_col)) else 0.0,
            "powerConsumption": float(row[power_col]) if power_col and pd.notna(row.get(power_col)) else 0.0,
        })
    
    return rows


def window_features(values: list[float]) -> dict:
    """Calculate windowed statistical features."""
    if not values:
        return {"mean": 0.0, "std": 0.0, "trend": 0.0, "max": 0.0}
    
    arr = np.asarray(values, dtype=float)
    arr = arr[~np.isnan(arr)]
    
    if len(arr) == 0:
        return {"mean": 0.0, "std": 0.0, "trend": 0.0, "max": 0.0}
    
    mean = float(arr.mean())
    std = float(arr.std()) if len(arr) > 1 else 0.0
    maxv = float(arr.max())
    
    if len(arr) >= 2:
        x = np.arange(len(arr))
        trend = float(np.polyfit(x, arr, 1)[0])
    else:
        trend = 0.0
    
    return {"mean": mean, "std": std, "trend": trend, "max": maxv}


def build_named_window(values: list[float], prefix: str) -> dict:
    """Build named window features for ML model input."""
    w = window_features(values)
    return {
        f"{prefix}_mean": w["mean"],
        f"{prefix}_std": w["std"],
        f"{prefix}_trend": w["trend"],
        f"{prefix}_max": w["max"],
    }


def prepare_ml_features(sensor_rows: list[dict], machine_type: str, window_size: int = 24) -> dict:
    """
    Prepare features for ML prediction based on machine type.
    Uses the last `window_size` rows for windowed features.
    All models now use standardized feature names: temperature, vibration, pressure, power
    """
    if len(sensor_rows) < 10:
        raise ValueError(f"Not enough data rows. Need at least 10, got {len(sensor_rows)}")
    
    recent = sensor_rows[-window_size:] if len(sensor_rows) >= window_size else sensor_rows
    
    temps = [r["temperature"] for r in recent if r.get("temperature") is not None]
    vibs = [r["vibration"] for r in recent if r.get("vibration") is not None]
    press = [r["pressure"] for r in recent if r.get("pressure") is not None]
    powers = [r["powerConsumption"] for r in recent if r.get("powerConsumption") is not None]
    
    t_feat = window_features(temps)
    v_feat = window_features(vibs)
    p_feat = window_features(press)
    
    return {
        "temperature": t_feat["mean"],
        "vibration": v_feat["mean"],
        "pressure": p_feat["mean"],
        "power": sum(powers) / len(powers) if powers else 0.0,
    }
