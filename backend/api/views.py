from __future__ import annotations

from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status

from .services.synthetic import generate_timeseries

# NEW: ML predictor (create this file as discussed)
# backend/ml/air_compressor_predict.py must exist
from ml.air_compressor_predict import predict_air_compressor
from ml.milling_predict import predict_milling
from ml.turbofan_predict import predict_turbofan

@api_view(["GET"])
@permission_classes([AllowAny])
def test(request):
    return Response({"message": "Backend is running"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    u = request.user
    return Response({"id": u.id, "username": u.username, "email": u.email})


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    username = (request.data.get("username") or "").strip()
    email = (request.data.get("email") or "").strip()
    password = request.data.get("password") or ""

    if not username or not password:
        return Response(
            {"detail": "username and password are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {"detail": "username already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(username=username, email=email, password=password)
    return Response(
        {"id": user.id, "username": user.username, "email": user.email},
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def synthetic_data(request):
    """
    Returns synthetic time-series payload for the frontend:
      {
        "equipment": [...],
        "sensorData": [...]
      }
    """
    payload = generate_timeseries(hours=100)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def air_compressor_prediction(request):
    payload = generate_timeseries(hours=100)
    rows = [r for r in payload.get("sensorData", []) if r.get("equipmentId") == "AC-001"]
    if not rows:
        return Response({"detail": "No AC-001 data available"}, status=status.HTTP_404_NOT_FOUND)

    latest = rows[-1]

    mapped = {
        "motor_power": latest.get("powerConsumption"),
        "outlet_temp": latest.get("temperature"),
        "haccz": latest.get("vibration"),
        "outlet_pressure_bar": (
            float(latest["pressure"]) / 14.5038 if latest.get("pressure") is not None else None
        ),
        # missing → None (predictor should handle)
        "rpm": None, "torque": None, "air_flow": None, "noise_db": None,
        "wpump_outlet_press": None, "water_inlet_temp": None, "water_outlet_temp": None,
        "wpump_power": None, "water_flow": None, "oilpump_power": None, "oil_tank_temp": None,
        "gaccx": None, "gaccy": None, "gaccz": None, "haccx": None, "haccy": None,
    }

    pred = predict_air_compressor(mapped)

    return Response({
        "equipmentId": "AC-001",
        "equipmentName": "Air Compressor #1",
        **pred,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def milling_predict(request):
    payload = generate_timeseries(hours=100)
    rows = [r for r in payload.get("sensorData", []) if r.get("equipmentId") == "MILL-001"]
    if not rows:
        return Response({"detail": "No MILL-001 data available"}, status=status.HTTP_404_NOT_FOUND)

    latest = rows[-1]

    # map UI schema -> AI4I-ish features you trained on
    # your synthetic milling mapping used:
    # temperature = Process temperature (C), vibration ~ Torque/20, pressure ~ RPM/30, powerConsumption = Tool wear
    process_k = (float(latest["temperature"]) + 273.15) if latest.get("temperature") is not None else None

    mapped = {
        "Process temperature [K]": process_k,
        "Torque [Nm]": float(latest["vibration"]) * 20.0 if latest.get("vibration") is not None else None,
        "Rotational speed [rpm]": float(latest["pressure"]) * 30.0 if latest.get("pressure") is not None else None,
        "Tool wear [min]": float(latest["powerConsumption"]) if latest.get("powerConsumption") is not None else None,

        # FIXED:
        "Air temperature [K]": (process_k - 10.0) if process_k is not None else None,
        "Type": "M",
    }

    pred = predict_milling(mapped)

    return Response({
        "equipmentId": "MILL-001",
        "equipmentName": "Milling Machine #1",
        **pred,
    })

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def turbofan_predict(request):
    """
    Predicts RUL (daysToFailure) / riskLevel / confidence for TURBO-001.
    IMPORTANT: this is a "best-effort" mapping from your synthetic schema
    (temperature/vibration/pressure/powerConsumption) -> FD001-like features.
    """

    payload = generate_timeseries(hours=100)
    rows = [r for r in payload.get("sensorData", []) if r.get("equipmentId") == "TF-001"]
    if not rows:
        return Response({"detail": "No TURBO-001 data available"}, status=status.HTTP_404_NOT_FOUND)

    latest = rows[-1]

    # --- Best-effort mapping UI -> turbofan features ---
    # FD001 features are: op1,op2,op3,s1..s21 (you trained on those)
    # Your synthetic rows have: temperature, vibration, pressure, powerConsumption
    # We'll map a few, and leave the rest missing -> filled in predict_turbofan().
    mapped = {
        "op1": latest.get("powerConsumption"),
        "op2": latest.get("pressure"),
        "op3": 0,

        "s1": latest.get("temperature"),
        "s2": latest.get("vibration"),
        "s3": latest.get("pressure"),
    }
    print("TF latest UI row:", latest)
    print("TF mapped keys:", mapped)
    pred = predict_turbofan(mapped)

    return Response(
        {
            "equipmentId": "TF-001",
            "equipmentName": "Turbofan Engine #1",
            **pred,
        }
    )
