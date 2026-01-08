from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from datetime import datetime, timedelta, timezone
import random
import pandas as pd

from api.services.degradation_state import update_health

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
DATA_DIR = BASE_DIR / "data"


@dataclass
class Equipment:
    id: str
    name: str
    type: str
    health: str  # unused, kept for compatibility


def _iso(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def generate_timeseries(machines: list, hours: int = 100) -> dict:
    now = datetime.now(timezone.utc)
    sensor_rows = []

    try:
        air_df = pd.read_csv(DATA_DIR / "air_compressor.csv")
        mill_df = pd.read_csv(DATA_DIR / "ai4i2020.csv")
    except Exception as e:
        print(f"Error loading CSVs: {e}")
        return {"equipment": [], "sensorData": []}

    for machine in machines:
        m_id = machine["id"]
        m_name = machine["name"]
        m_type = machine["type"]

        # 🔥 persistent degradation
        health = update_health(m_id)
        severity = 1.0 - health  # 0 = perfect, 1 = bad

        # ---------------------------------------------------------
        # Air Compressor
        # ---------------------------------------------------------
        if m_type == "AC":
            chunk = air_df.sample(n=hours, replace=True).reset_index(drop=True)

            for i in range(hours):
                ts = now - timedelta(hours=(hours - 1 - i))
                row = chunk.iloc[i]

                # ✅ Store RAW values for ML (no degradation)
                raw_temp = float(row["outlet_temp"])
                raw_vib = float(row["haccz"])
                raw_press = float(row["outlet_pressure_bar"]) * 14.5038
                raw_power = float(row.get("motor_power", 0.6))

                # ✅ Apply degradation ONLY to display values
                sensor_rows.append({
                    "equipmentId": m_id,
                    "equipmentName": m_name,
                    "timestamp": _iso(ts),

                    # Display values (with degradation for charts)
                    "temperature": raw_temp * (1 + severity * 0.4),
                    "vibration": raw_vib * (1 + severity * 0.8),
                    "pressure": raw_press * (1 - severity * 0.3),
                    "powerConsumption": raw_power * (1 + severity * 0.6),

                    # ✅ NEW: Raw values for ML prediction
                    "raw_outlet_temp": raw_temp,
                    "raw_haccz": raw_vib,
                    "raw_outlet_pressure_bar": raw_press / 14.5038,
                    "raw_motor_power": raw_power,
                })

        # ---------------------------------------------------------
        # Milling Machine
        # ---------------------------------------------------------
        elif m_type == "CNC":
            chunk = mill_df.sample(n=hours, replace=True).reset_index(drop=True)

            for i in range(hours):
                ts = now - timedelta(hours=(hours - 1 - i))
                row = chunk.iloc[i]

                # ✅ Raw values (no degradation)
                raw_proc_temp = float(row["Process temperature [K]"])
                raw_torque = float(row["Torque [Nm]"])
                raw_rpm = float(row["Rotational speed [rpm]"])
                raw_wear = float(row["Tool wear [min]"])

                # Convert to display units
                display_temp = (raw_proc_temp - 273.15)
                display_vib = raw_torque / 20.0
                display_press = raw_rpm / 30.0

                sensor_rows.append({
                    "equipmentId": m_id,
                    "equipmentName": m_name,
                    "timestamp": _iso(ts),

                    # Display values (with degradation)
                    "temperature": display_temp * (1 + severity * 0.3),
                    "vibration": display_vib * (1 + severity * 0.6),
                    "pressure": display_press * (1 - severity * 0.25),
                    "powerConsumption": raw_wear * (1 + severity * 0.5),

                    # ✅ NEW: Raw values for ML
                    "raw_Process_temperature_K": raw_proc_temp,
                    "raw_Torque_Nm": raw_torque,
                    "raw_Rotational_speed_rpm": raw_rpm,
                    "raw_Tool_wear_min": raw_wear,
                    "raw_Air_temperature_K": float(row.get("Air temperature [K]", raw_proc_temp)),
                })

        # ---------------------------------------------------------
        # Turbofan
        # ---------------------------------------------------------
        elif m_type == "TE":
            for i in range(hours):
                ts = now - timedelta(hours=(hours - 1 - i))
                d = i / max(1, hours - 1)

                base_temp = 600 + 60 * d
                base_vib = 1.0 + 3.5 * d
                base_press = 30 - 6 * d
                base_power = 0.6 + 0.4 * d

                sensor_rows.append({
                    "equipmentId": m_id,
                    "equipmentName": m_name,
                    "timestamp": _iso(ts),

                    # Display values (with degradation)
                    "temperature": base_temp * (1 + severity * 0.3) + random.gauss(0, 6),
                    "vibration": base_vib * (1 + severity * 0.5) + random.gauss(0, 0.4),
                    "pressure": base_press * (1 - severity * 0.4) + random.gauss(0, 0.6),
                    "powerConsumption": base_power * (1 + severity * 0.4),

                    # ✅ NEW: Raw values for ML (no degradation, less noise)
                    "raw_op1": base_power,
                    "raw_op2": base_press,
                    "raw_s1": base_temp + random.gauss(0, 3),
                    "raw_s2": base_vib + random.gauss(0, 0.2),
                    "raw_s3": base_press + random.gauss(0, 0.3),
                })

    return {
        "equipment": machines,
        "sensorData": sensor_rows,
    }