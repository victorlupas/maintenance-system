from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from datetime import datetime, timedelta, timezone
import random
import pandas as pd
import numpy as np

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


# Thresholds for fault classification (from training data analysis)
# Air Compressor: faulty when values exceed these
# Widened range to produce more gradual predictions
AC_FAULT_THRESHOLDS = {
    "temperature": 145,  # outlet_temp (widened from 131)
    "vibration": 5.5,    # haccz (widened from 4.3)
    "pressure": 7.5,     # outlet_pressure_bar (widened from 5.9)
    "power": 14000,      # motor_power (widened from 10320)
}
AC_HEALTHY_VALUES = {
    "temperature": 95,   # lowered from 110
    "vibration": 2.0,    # lowered from 3.0
    "pressure": 1.5,     # lowered from 2.8
    "power": 3000,       # lowered from 4761
}


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

        # persistent degradation
        health = update_health(m_id)
        severity = 1.0 - health  # 0 = perfect, 1 = bad

        # ---------------------------------------------------------
        # Air Compressor
        # ---------------------------------------------------------
        if m_type == "AC":
            for i in range(hours):
                ts = now - timedelta(hours=(hours - 1 - i))
                
                # Progress through time (0 to 1)
                progress = i / max(1, hours - 1)
                
                # Combine time progress with severity for realistic degradation
                # severity comes from persistent health state (0=healthy, 1=failing)
                # Use linear scaling - severity directly controls degradation level
                degradation = severity * 0.7 + progress * 0.3  # severity is primary driver
                degradation = min(degradation, 1.0)
                
                # Interpolate between healthy and faulty values based on degradation
                temp = AC_HEALTHY_VALUES["temperature"] + degradation * (AC_FAULT_THRESHOLDS["temperature"] - AC_HEALTHY_VALUES["temperature"])
                vib = AC_HEALTHY_VALUES["vibration"] + degradation * (AC_FAULT_THRESHOLDS["vibration"] - AC_HEALTHY_VALUES["vibration"])
                press = AC_HEALTHY_VALUES["pressure"] + degradation * (AC_FAULT_THRESHOLDS["pressure"] - AC_HEALTHY_VALUES["pressure"])
                power = AC_HEALTHY_VALUES["power"] + degradation * (AC_FAULT_THRESHOLDS["power"] - AC_HEALTHY_VALUES["power"])
                
                # Add realistic noise
                temp += random.gauss(0, 3)
                vib += random.gauss(0, 0.2)
                press += random.gauss(0, 0.3)
                power += random.gauss(0, 200)

                sensor_rows.append({
                    "equipmentId": m_id,
                    "equipmentName": m_name,
                    "timestamp": _iso(ts),

                    # Display values (same as ML values now)
                    "temperature": temp,
                    "vibration": vib,
                    "pressure": press,
                    "powerConsumption": power,

                    # Raw values for ML prediction (same scale)
                    "raw_outlet_temp": temp,
                    "raw_haccz": vib,
                    "raw_outlet_pressure_bar": press,
                    "raw_motor_power": power,
                })

        # ---------------------------------------------------------
        # Milling Machine
        # ---------------------------------------------------------
        elif m_type == "CNC":
            # CNC healthy vs faulty ranges (from ai4i2020.csv analysis)
            # Failures correlate with: high temp, high torque, high wear, low RPM
            CNC_HEALTHY = {"temperature": 35, "vibration": 1.5, "pressure": 50, "power": 50}
            CNC_FAULTY = {"temperature": 42, "vibration": 3.5, "pressure": 40, "power": 200}
            
            for i in range(hours):
                ts = now - timedelta(hours=(hours - 1 - i))
                
                # Progress through time
                progress = i / max(1, hours - 1)
                degradation = severity * 0.7 + progress * 0.3
                degradation = min(degradation, 1.0)
                
                # Interpolate between healthy and faulty
                temp = CNC_HEALTHY["temperature"] + degradation * (CNC_FAULTY["temperature"] - CNC_HEALTHY["temperature"])
                vib = CNC_HEALTHY["vibration"] + degradation * (CNC_FAULTY["vibration"] - CNC_HEALTHY["vibration"])
                press = CNC_HEALTHY["pressure"] + degradation * (CNC_FAULTY["pressure"] - CNC_HEALTHY["pressure"])
                power = CNC_HEALTHY["power"] + degradation * (CNC_FAULTY["power"] - CNC_HEALTHY["power"])
                
                # Add noise
                temp += random.gauss(0, 1)
                vib += random.gauss(0, 0.15)
                press += random.gauss(0, 2)
                power += random.gauss(0, 10)

                sensor_rows.append({
                    "equipmentId": m_id,
                    "equipmentName": m_name,
                    "timestamp": _iso(ts),

                    # Display and ML values
                    "temperature": temp,
                    "vibration": vib,
                    "pressure": press,
                    "powerConsumption": power,
                })

        # ---------------------------------------------------------
        # Turbofan
        # ---------------------------------------------------------
        elif m_type == "TE":
            # Turbofan: RUL model predicts remaining cycles
            # Low RUL = high failure probability
            # severity affects how far along the degradation curve we are
            TE_HEALTHY = {"temperature": 600, "vibration": 1.0, "pressure": 30, "power": 0.6}
            TE_FAULTY = {"temperature": 680, "vibration": 5.0, "pressure": 22, "power": 1.0}
            
            for i in range(hours):
                ts = now - timedelta(hours=(hours - 1 - i))
                
                # Progress through time
                progress = i / max(1, hours - 1)
                degradation = severity * 0.7 + progress * 0.3
                degradation = min(degradation, 1.0)
                
                # Interpolate between healthy and faulty
                temp = TE_HEALTHY["temperature"] + degradation * (TE_FAULTY["temperature"] - TE_HEALTHY["temperature"])
                vib = TE_HEALTHY["vibration"] + degradation * (TE_FAULTY["vibration"] - TE_HEALTHY["vibration"])
                press = TE_HEALTHY["pressure"] + degradation * (TE_FAULTY["pressure"] - TE_HEALTHY["pressure"])
                power = TE_HEALTHY["power"] + degradation * (TE_FAULTY["power"] - TE_HEALTHY["power"])
                
                # Add noise
                temp += random.gauss(0, 5)
                vib += random.gauss(0, 0.3)
                press += random.gauss(0, 0.5)
                power += random.gauss(0, 0.05)

                sensor_rows.append({
                    "equipmentId": m_id,
                    "equipmentName": m_name,
                    "timestamp": _iso(ts),

                    # Display and ML values
                    "temperature": temp,
                    "vibration": vib,
                    "pressure": press,
                    "powerConsumption": power,

                    # Raw values for ML (same as display)
                    "raw_s1": temp,
                    "raw_s2": vib,
                    "raw_s3": press,
                    "raw_op1": power,
                })

    return {
        "equipment": machines,
        "sensorData": sensor_rows,
    }