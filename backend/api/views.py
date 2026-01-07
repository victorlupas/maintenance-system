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

# NEW: ML predictor (create this file as discussed)
# backend/ml/air_compressor_predict.py must exist
from ml.air_compressor_predict import predict_air_compressor
from ml.milling_predict import predict_milling
from ml.turbofan_predict import predict_turbofan


# Helper function to get the list of the machines
def machine_list(request):
    user_machines = UserMachine.objects.filter(user=request.user).select_related('machine', 'machine__type').order_by("-id")
    
    if not user_machines.exists():
        # Fallback: if user has no machines, return empty or default
        return Response({"equipment": [], "sensorData": []})
    
    machine_list = []
    for um in user_machines:
        machine_list.append({
            "id": um.machine.machine_id,
            "name": um.machine.name,
            "type": um.machine.type.type_id, # This links to the CSV logic
            "health": "good", # Default health, or you can add a health field to UserMachine later
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
    dummy_user = User(username=username, email=email)

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
    UserMachine.objects.create(user=request.user, machine=machine, nickname = name, is_tracking=True)
    
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
    # 1. Get the user's machines from the DB
    user_machines = UserMachine.objects.filter(user=request.user).select_related('machine', 'machine__type').order_by("-id")
    
    if not user_machines.exists():
        # Fallback: if user has no machines, return empty or default
        return Response({"equipment": [], "sensorData": []})

    # 2. Convert DB objects to a simple list for the synthetic service
    # We pass the real MachineType ID (e.g., 'air_compressor') so the service knows what math to use.
    machine_list = []
    for um in user_machines:
        machine_list.append({
            "id": um.machine.machine_id,
            "name": um.machine.name,
            "type": um.machine.type.type_id, # This links to the CSV logic
            "health": "good", # Default health, or you can add a health field to UserMachine later
            "dateAdded": um.created_at.isoformat(),
        })

    # 3. Call the updated service
    payload = generate_timeseries(machine_list, hours=100)
    return Response(payload)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_machine(request, machine_id):
    """
    Removes the machine from the user's dashboard.
    """
    try:
        # Find the specific link between THIS user and THAT machine
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def air_compressor_prediction(request):

    machines_list = machine_list(request)
    payload = generate_timeseries(machines_list, hours=100)
    rows = [r for r in payload.get("sensorData", []) if r.get("equipmentId") == "AC"]
    if not rows:
        return Response({"detail": f"No {machines_list['name']} data available."}, status=status.HTTP_404_NOT_FOUND)

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
        "equipmentId": f"{machines_list['id']}",
        "equipmentName": f"{machines_list['name']}",
        **pred,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def milling_predict(request):

    machines_list = machine_list(request)
    payload = generate_timeseries(machines_list, hours=100)
    rows = [r for r in payload.get("sensorData", []) if r.get("equipmentId") == "CNC"]
    if not rows:
        return Response({"detail": f"No {machines_list['name']} data available"}, status=status.HTTP_404_NOT_FOUND)

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
        "equipmentId": f"{machines_list['id']}",
        "equipmentName": f"{machines_list['name']}",
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
    machines_list = machine_list(request)
    payload = generate_timeseries(machines_list, hours=100)
    rows = [r for r in payload.get("sensorData", []) if r.get("equipmentId") == "TE"]
    if not rows:
        return Response({"detail": f"No {machines_list['name']} data available"}, status=status.HTTP_404_NOT_FOUND)

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

    return Response({
        "equipmentId": f"{machines_list['id']}",
        "equipmentName": f"{machines_list['name']}",
        **pred,
    })