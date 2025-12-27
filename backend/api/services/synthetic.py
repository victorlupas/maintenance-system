from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from datetime import datetime, timedelta, timezone
import random
import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
DATA_DIR = BASE_DIR / "data"


@dataclass
class Equipment:
    id: str
    name: str
    type: str
    health: str  # "good" | "warning" | "critical"


def _iso(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def generate_equipment() -> list[Equipment]:
    # 3 machine types based on your datasets
    return [
        Equipment(id="AC", name="Air Compressor #1", type="air_compressor", health="good"),
        Equipment(id="CNC", name="Milling Machine #1", type="milling", health="warning"),
        Equipment(id="TE", name="Turbofan Engine #1", type="turbofan", health="critical"),
    ]


# def generate_timeseries(machines: list, hours: int = 100) -> dict:
#     """
#     Returns dict shaped for React:
#       { equipment: [...], sensorData: [...] }
#     """
#     equipment = generate_equipment()
#     now = datetime.now(timezone.utc)

#     sensor_rows = []

#     # Load datasets safely
#     try:
#         air_df = pd.read_csv(DATA_DIR / "air_compressor.csv")
#         mill_df = pd.read_csv(DATA_DIR / "ai4i2020.csv")
#     except Exception:
#         # If files missing, return empty to prevent crash
#         return {"equipment": machines, "sensorData": []}

#     # pick a random chunk (last 100 points)
#     air_chunk = air_df.sample(n=hours, random_state=random.randint(1, 9999)).reset_index(drop=True)

#     for machine in machines:
#         m_id = machine["type_id"]

#     # map columns -> your UI schema
#     for i in range(hours):
#         ts = now - timedelta(hours=(hours - 1 - i))
#         row = air_chunk.iloc[i]
#         sensor_rows.append({
#             "equipmentId": "AC-001",
#             "equipmentName": "Air Compressor #1",
#             "timestamp": _iso(ts),
#             "temperature": float(row["outlet_temp"]),
#             "vibration": float(row["haccz"]),  # using one accel axis as a proxy
#             "pressure": float(row["outlet_pressure_bar"]) * 14.5038,  # bar -> PSI-ish
#             "powerConsumption": float(row["motor_power"]),
#         })

#     # --- Milling dataset mapping (AI4I) ---
#     mill_path = DATA_DIR / "ai4i2020.csv"
#     mill_df = pd.read_csv(mill_path)
#     mill_chunk = mill_df.sample(n=hours, random_state=random.randint(1, 9999)).reset_index(drop=True)

#     for i in range(hours):
#         ts = now - timedelta(hours=(hours - 1 - i))
#         row = mill_chunk.iloc[i]
#         sensor_rows.append({
#             "equipmentId": "MILL-001",
#             "equipmentName": "Milling Machine #1",
#             "timestamp": _iso(ts),
#             "temperature": float(row["Process temperature [K]"] - 273.15),  # K -> C
#             "vibration": float(row["Torque [Nm]"]) / 20.0,  # proxy: torque -> vib-ish
#             "pressure": float(row["Rotational speed [rpm]"]) / 30.0,  # proxy: rpm -> “pressure”
#             "powerConsumption": float(row["Tool wear [min]"]),
#         })

#     # --- Turbofan: keep it synthetic for now (degradation curve) ---
#     # Later you can parse NASA files properly; for now give clean degradation behavior
#     for i in range(hours):
#         ts = now - timedelta(hours=(hours - 1 - i))
#         d = i / max(1, hours - 1)  # 0..1
#         sensor_rows.append({
#             "equipmentId": "TF-001",
#             "equipmentName": "Turbofan Engine #1",
#             "timestamp": _iso(ts),
#             "temperature": 600 + 50 * d + random.gauss(0, 2),
#             "vibration": 1.0 + 3.0 * d + random.gauss(0, 0.1),
#             "pressure": 30 - 5 * d + random.gauss(0, 0.2),
#             "powerConsumption": 0.5 + 0.2 * d + random.gauss(0, 0.02),
#         })

#     return {
#         "equipment": [e.__dict__ for e in equipment],
#         "sensorData": sensor_rows,
#     }


def generate_timeseries(machines: list, hours: int = 100) -> dict:
    """
    machines: list of dicts -> [{"id": "...", "name": "...", "type": "..."}, ...]
    """
    now = datetime.now(timezone.utc)
    sensor_rows = []

    # Pre-load datasets once to save performance
    try:
        air_df = pd.read_csv(DATA_DIR / "air_compressor.csv")
        mill_df = pd.read_csv(DATA_DIR / "ai4i2020.csv")
    except Exception as e:
        print(f"Error loading CSVs: {e}")
        return {"equipment": [], "sensorData": []}

    # Loop through the USER'S specific machines
    for machine in machines:
        m_id = machine["id"]
        m_name = machine["name"]
        m_type = machine["type"] # 
        
        # ---------------------------------------------------------
        # Logic A: Air Compressor
        # ---------------------------------------------------------
        if m_type == "AC":
            # Pick random chunk for THIS specific machine
            chunk = air_df.sample(n=hours, replace=True).reset_index(drop=True)
            for i in range(hours):
                ts = now - timedelta(hours=(hours - 1 - i))
                row = chunk.iloc[i]
                sensor_rows.append({
                    "equipmentId": m_id,
                    "equipmentName": m_name,
                    "timestamp": _iso(ts),
                    "temperature": float(row["outlet_temp"]),
                    "vibration": float(row["haccz"]),
                    "pressure": float(row["outlet_pressure_bar"]) * 14.5038,
                })

        # ---------------------------------------------------------
        # Logic B: Milling Machine
        # ---------------------------------------------------------
        elif m_type == "CNC":
            chunk = mill_df.sample(n=hours, replace=True).reset_index(drop=True)
            for i in range(hours):
                ts = now - timedelta(hours=(hours - 1 - i))
                row = chunk.iloc[i]
                sensor_rows.append({
                    "equipmentId": m_id,
                    "equipmentName": m_name,
                    "timestamp": _iso(ts),
                    "temperature": float(row["Process temperature [K]"] - 273.15),
                    "vibration": float(row["Torque [Nm]"]) / 20.0,
                    "pressure": float(row["Rotational speed [rpm]"]) / 30.0,
                })

        # ---------------------------------------------------------
        # Logic C: Turbofan
        # ---------------------------------------------------------
        elif m_type == "TE":
            for i in range(hours):
                ts = now - timedelta(hours=(hours - 1 - i))
                # Simple math simulation
                d = i / max(1, hours - 1)
                sensor_rows.append({
                    "equipmentId": m_id,
                    "equipmentName": m_name,
                    "timestamp": _iso(ts),
                    "temperature": 600 + 50 * d + random.gauss(0, 2),
                    "vibration": 1.0 + 3.0 * d + random.gauss(0, 0.1),
                    "pressure": 30 - 5 * d + random.gauss(0, 0.2),
                })

    return {
        "equipment": machines,
        "sensorData": sensor_rows,
    }