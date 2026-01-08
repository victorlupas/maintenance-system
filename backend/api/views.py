from __future__ import annotations

from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from .models import Machine, MachineType, UserMachine
from django.shortcuts import get_object_or_404
from .services.synthetic import generate_timeseries
from django.contrib.auth.password_validation import validate_password
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken

# NEW: ML predictor
from ml.air_compressor_predict import predict_air_compressor
from ml.milling_predict import predict_milling
from ml.turbofan_predict import predict_turbofan
from api.utils.timeseries_features import window_features
from api.utils.timeseries_features import build_named_window


# Helper function to get the list of the machines
def machine_list(request):
    user_machines = UserMachine.objects.filter(user=request.user).select_related('machine', 'machine__type').order_by(
        "-id")

    if not user_machines.exists():
        return []

    machine_list = []
    for um in user_machines:
        machine_list.append({
            "id": um.machine.machine_id,
            "name": um.machine.name,
            "type": um.machine.type.type_id,
            "health": "good",
            "dateAdded": um.created_at.isoformat(),
        })

    return machine_list


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
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    try:
        validate_email(email)
    except ValidationError:
        return Response(
            {"detail": "Invalid email address"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email=email).exists():
        return Response(
            {"detail": "Email already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        validate_password(password)
    except ValidationError as e:
        return Response(
            {"detail": list(e.messages)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    confirm_password = request.data.get("confirm_password") or ""

    if password != confirm_password:
        return Response(
            {"detail": "Passwords do not match"},
            status=status.HTTP_400_BAD_REQUEST,
        )

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
    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "user": {"id": user.id, "username": user.username, "email": user.email},
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    """
    Blacklist the refresh token to invalidate it immediately.
    Frontend should send the refresh token in the request body.
    """
    try:
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = RefreshToken(refresh_token)
        token.blacklist()

        return Response(
            {"detail": "Logout successful"},
            status=status.HTTP_205_RESET_CONTENT,
        )
    except Exception as e:
        return Response(
            {"detail": "Invalid token or already blacklisted"},
            status=status.HTTP_400_BAD_REQUEST,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_machine_types(request):
    """Return available machine types for the dropdown."""
    types = MachineType.objects.all()
    data = [{"id": t.type_id, "name": t.name} for t in types]
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_machine(request):
    """User chooses a type and gives it a name."""
    type_id = request.data.get("type_id")
    name = request.data.get("name")

    if not type_id or not name:
        return Response({"detail": "Type and Name are required"}, status=400)

    m_type = get_object_or_404(MachineType, pk=type_id)

    # 1. Create the Machine (ID generates automatically via models.py logic)
    machine = Machine.objects.create(type=m_type, name=name)

    # 2. Assign to User
    UserMachine.objects.create(user=request.user, machine=machine, nickname=name, is_tracking=True)

    return Response({
        "id": machine.machine_id,
        "name": machine.name,
        "type": machine.type.name
    }, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def synthetic_data(request):
    """
    Generate data ONLY for machines tracking by the current user.
    """
    user_machines = UserMachine.objects.filter(user=request.user).select_related('machine', 'machine__type').order_by(
        "-id")

    if not user_machines.exists():
        return Response({"equipment": [], "sensorData": []})

    machines = machine_list(request)
    payload = generate_timeseries(machines, hours=100)
    return Response(payload)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_machine(request, machine_id):
    """
    Removes the machine from the user's dashboard.
    """
    try:
        user_machine = UserMachine.objects.get(
            user=request.user,
            machine__machine_id=machine_id
        )
        user_machine.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    except UserMachine.DoesNotExist:
        return Response(
            {"detail": "Machine not found or not tracked by you."},
            status=status.HTTP_404_NOT_FOUND
        )


# Keep the SERVER version (doc 3) for these - they're much better!
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def air_compressor_prediction(request):
    machines = machine_list(request)
    ac_machines = [m for m in machines if m["type"] == "AC"]

    if not ac_machines:
        return Response([])

    payload = generate_timeseries(machines, hours=100)
    results = []

    for ac in ac_machines:
        rows = [
            r for r in payload.get("sensorData", [])
            if r.get("equipmentId") == ac["id"]
        ]

        if len(rows) < 10:
            continue

        WINDOW = 24
        recent = rows[-WINDOW:]

        temps = [r["temperature"] for r in recent if r.get("temperature") is not None]
        vibs = [r["vibration"] for r in recent if r.get("vibration") is not None]
        press = [r["pressure"] for r in recent if r.get("pressure") is not None]

        t_feat = window_features(temps)
        v_feat = window_features(vibs)
        p_feat = window_features(press)

        mapped = {
            "motor_power": sum(r.get("powerConsumption", 0) for r in recent) / len(recent),
            "outlet_temp": t_feat["mean"],
            "haccz": v_feat["std"],
            "outlet_pressure_bar": p_feat["mean"] / 14.5038,
        }

        pred = predict_air_compressor(mapped)

        results.append({
            "equipmentId": ac["id"],
            "equipmentName": ac["name"],
            **pred,
        })

    return Response(results)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def milling_prediction(request):
    machines = machine_list(request)
    cnc_machines = [m for m in machines if m["type"] == "CNC"]

    if not cnc_machines:
        return Response([])

    payload = generate_timeseries(machines, hours=100)
    results = []

    for cnc in cnc_machines:
        rows = [
            r for r in payload.get("sensorData", [])
            if r.get("equipmentId") == cnc["id"]
        ]

        if len(rows) < 10:
            continue

        WINDOW = 24
        recent = rows[-WINDOW:]

        temps = [r["temperature"] for r in recent if r.get("temperature") is not None]
        vibs = [r["vibration"] for r in recent if r.get("vibration") is not None]
        press = [r["pressure"] for r in recent if r.get("pressure") is not None]

        mapped = {}

        mapped.update(build_named_window(
            [t + 273.15 for t in temps],
            "Air temperature [K]"
        ))

        mapped.update(build_named_window(
            [t + 273.15 for t in temps],
            "Process temperature [K]"
        ))

        mapped.update(build_named_window(
            [p * 30.0 for p in press],
            "Rotational speed [rpm]"
        ))

        mapped.update(build_named_window(
            [v * 20.0 for v in vibs],
            "Torque [Nm]"
        ))

        mapped.update(build_named_window(
            [r.get("powerConsumption", 0.0) for r in recent],
            "Tool wear [min]"
        ))

        mapped["Type"] = "M"

        try:
            pred = predict_milling(mapped)
        except Exception as e:
            print("❌ MILLING PREDICT FAILED")
            print("Machine:", cnc["id"])
            print("Exception:", repr(e))
            continue

        results.append({
            "equipmentId": cnc["id"],
            "equipmentName": cnc["name"],
            **pred,
        })

    return Response(results)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def turbofan_prediction(request):
    machines = machine_list(request)
    te_machines = [m for m in machines if m["type"] == "TE"]

    if not te_machines:
        return Response([])

    payload = generate_timeseries(machines, hours=100)
    results = []

    for te in te_machines:
        rows = [
            r for r in payload.get("sensorData", [])
            if r.get("equipmentId") == te["id"]
        ]

        if not rows:
            continue

        latest = rows[-1]

        mapped = {
            "op1": latest.get("powerConsumption", 0.0),
            "op2": latest.get("pressure", 0.0),
            "op3": 0.0,
            "s1": latest.get("temperature", 0.0),
            "s2": latest.get("vibration", 0.0),
            "s3": latest.get("pressure", 0.0),
        }

        try:
            pred = predict_turbofan(mapped)
        except Exception as e:
            print("❌ TURBOFAN PREDICT FAILED")
            print("Machine:", te["id"])
            print("Exception:", repr(e))
            continue

        results.append({
            "equipmentId": te["id"],
            "equipmentName": te["name"],
            **pred,
        })

    return Response(results)