from __future__ import annotations
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from .models import Alert, Machine, MachineType, UserMachine
from django.shortcuts import get_object_or_404
from .services.synthetic import generate_timeseries
from django.contrib.auth.password_validation import validate_password
from django.core.validators import validate_email
from django.core.mail import send_mail
from django.core.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken

# NEW: ML predictor
from ml.air_compressor_predict import predict_air_compressor
from ml.milling_predict import predict_milling
from ml.turbofan_predict import predict_turbofan
from api.utils.timeseries_features import window_features
from api.utils.timeseries_features import build_named_window
from api.services.data_parser import parse_uploaded_file, extract_sensor_data, prepare_ml_features

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


# Helper for email alerts
# backend/api/views.py

def check_and_send_alert(user, machine_id, machine_name, prediction_result):
    """
    Final Version: Checks for critical status and respects the 60-minute cooldown.
    """
    # 1. Check Risk Level
    risk_level = prediction_result.get("riskLevel", "").lower()
    is_critical = "critical" in risk_level or "fail" in risk_level

    if not is_critical:
        return  # Everything is fine, do nothing.

    # 2. Fetch Machine
    try:
        machine_obj = Machine.objects.get(machine_id=machine_id)
    except Machine.DoesNotExist:
        return

    # 3. ANTI-SPAM CHECK (Re-enabled)
    # Checks if we already sent a critical alert for this machine in the last 60 minutes
    recent_alert = Alert.objects.filter(
        machine=machine_obj,
        created_for=user,
        severity="critical",
        timestamp__gte=timezone.now() - timedelta(minutes=60)
    ).exists()

    if recent_alert:
        print(f"SKIPPING email for {machine_name}: Already sent in last hour.")
        return

    # 4. Create Alert & Send Email
    print(f"Sending CRITICAL alert for {machine_name}...")
    
    Alert.objects.create(
        machine=machine_obj,
        created_for=user,
        severity="critical",
        description=f"Automated Alert: Machine {machine_name} is in CRITICAL state."
    )

    try:
        send_mail(
            subject=f"CRITICAL WARNING: {machine_name}",
            message=f"Hello {user.username},\n\nYour machine '{machine_name}' (ID: {machine_id}) has reached a CRITICAL state.\n\nPlease inspect it immediately.\n\nRegards,\nMaintenance System",
            from_email="system@maintenance.app",
            recipient_list=[user.email],
            fail_silently=True # Set to True for production so it doesn't crash the app if email fails
        )
    except Exception as e:
        print(f"Email sending failed: {e}")


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

        # Use raw values from synthetic data (matches training data scale)
        temps = [r.get("raw_outlet_temp", r["temperature"]) for r in recent]
        vibs = [r.get("raw_haccz", r["vibration"]) for r in recent]
        press = [r.get("raw_outlet_pressure_bar", r["pressure"]) for r in recent]
        powers = [r.get("raw_motor_power", r.get("powerConsumption", 0)) for r in recent]

        t_feat = window_features(temps)
        v_feat = window_features(vibs)
        p_feat = window_features(press)

        mapped = {
            "temperature": t_feat["mean"],
            "vibration": v_feat["mean"],
            "pressure": p_feat["mean"],
            "power": sum(powers) / len(powers) if powers else 0.0,
        }

        try:
            pred = predict_air_compressor(mapped)
            check_and_send_alert(request.user, ac["id"], ac["name"], pred)
        except Exception as e:
            print("AIR COMPRESSOR PREDICT FAILED:", ac["id"], repr(e))
            continue

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

        # Use display values (already converted to standard scale in synthetic.py)
        temps = [r["temperature"] for r in recent if r.get("temperature") is not None]
        vibs = [r["vibration"] for r in recent if r.get("vibration") is not None]
        press = [r["pressure"] for r in recent if r.get("pressure") is not None]
        powers = [r.get("powerConsumption", 0) for r in recent]

        t_feat = window_features(temps)
        v_feat = window_features(vibs)
        p_feat = window_features(press)

        mapped = {
            "temperature": t_feat["mean"],
            "vibration": v_feat["mean"],
            "pressure": p_feat["mean"],
            "power": sum(powers) / len(powers) if powers else 0.0,
        }

        try:
            pred = predict_milling(mapped)
            check_and_send_alert(request.user, cnc["id"], cnc["name"], pred)
        except Exception as e:
            print("MILLING PREDICT FAILED:", cnc["id"], repr(e))
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

        WINDOW = 24
        recent = rows[-WINDOW:]

        # Use raw values for turbofan (matches training data scale)
        temps = [r.get("raw_s1", r["temperature"]) for r in recent]
        vibs = [r.get("raw_s2", r["vibration"]) for r in recent]
        press = [r.get("raw_s3", r["pressure"]) for r in recent]
        powers = [r.get("raw_op1", r.get("powerConsumption", 0)) for r in recent]

        t_feat = window_features(temps)
        v_feat = window_features(vibs)
        p_feat = window_features(press)

        mapped = {
            "temperature": t_feat["mean"],
            "vibration": v_feat["mean"],
            "pressure": p_feat["mean"],
            "power": sum(powers) / len(powers) if powers else 0.0,
        }

        try:
            pred = predict_turbofan(mapped)
            check_and_send_alert(request.user, te["id"], te["name"], pred)
        except Exception as e:
            print("TURBOFAN PREDICT FAILED:", te["id"], repr(e))
            continue

        results.append({
            "equipmentId": te["id"],
            "equipmentName": te["name"],
            **pred,
        })

    return Response(results)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_machine_with_data(request):
    """
    Add a new machine with uploaded data log file.
    Accepts multipart form data with:
    - name: machine name
    - type_id: machine type (AC, CNC, TE)
    - data_file: CSV or JSON file with sensor readings
    """
    name = request.data.get("name")
    type_id = request.data.get("type_id")
    data_file = request.FILES.get("data_file")

    if not name or not type_id:
        return Response({"detail": "Name and type_id are required"}, status=400)

    if not data_file:
        return Response({"detail": "data_file is required"}, status=400)

    m_type = get_object_or_404(MachineType, pk=type_id)

    # Parse the uploaded file
    try:
        file_content = data_file.read().decode("utf-8")
        df = parse_uploaded_file(file_content, data_file.name)
    except Exception as e:
        return Response({"detail": f"Failed to parse file: {str(e)}"}, status=400)

    if df.empty:
        return Response({"detail": "Uploaded file contains no data"}, status=400)

    # Extract sensor data
    try:
        sensor_rows = extract_sensor_data(df, type_id)
    except Exception as e:
        return Response({"detail": f"Failed to extract sensor data: {str(e)}"}, status=400)

    # Prepare ML features and run prediction
    try:
        features = prepare_ml_features(sensor_rows, type_id)
        
        if type_id == "AC":
            prediction = predict_air_compressor(features)
        elif type_id == "CNC":
            prediction = predict_milling(features)
        elif type_id == "TE":
            prediction = predict_turbofan(features)
        else:
            prediction = {"probFailure": 0.0, "riskLevel": "unknown", "confidence": 0.0}
    except Exception as e:
        return Response({"detail": f"ML prediction failed: {str(e)}"}, status=400)

    # Create the machine
    machine = Machine.objects.create(type=m_type, name=name)
    UserMachine.objects.create(user=request.user, machine=machine, nickname=name, is_tracking=True)

    # Check for alerts
    check_and_send_alert(request.user, machine.machine_id, name, prediction)

    return Response({
        "id": machine.machine_id,
        "name": machine.name,
        "type": machine.type.name,
        "prediction": prediction,
        "dataRowsProcessed": len(sensor_rows),
    }, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def predict_from_upload(request, machine_id):
    """
    Run prediction on an existing machine using uploaded data log.
    Accepts multipart form data with:
    - data_file: CSV or JSON file with sensor readings
    """
    data_file = request.FILES.get("data_file")

    if not data_file:
        return Response({"detail": "data_file is required"}, status=400)

    # Verify machine exists and user has access
    try:
        user_machine = UserMachine.objects.select_related('machine', 'machine__type').get(
            user=request.user,
            machine__machine_id=machine_id
        )
    except UserMachine.DoesNotExist:
        return Response({"detail": "Machine not found or not tracked by you"}, status=404)

    machine = user_machine.machine
    type_id = machine.type.type_id

    # Parse the uploaded file
    try:
        file_content = data_file.read().decode("utf-8")
        df = parse_uploaded_file(file_content, data_file.name)
    except Exception as e:
        return Response({"detail": f"Failed to parse file: {str(e)}"}, status=400)

    if df.empty:
        return Response({"detail": "Uploaded file contains no data"}, status=400)

    # Extract sensor data
    try:
        sensor_rows = extract_sensor_data(df, type_id)
    except Exception as e:
        return Response({"detail": f"Failed to extract sensor data: {str(e)}"}, status=400)

    # Prepare ML features and run prediction
    try:
        features = prepare_ml_features(sensor_rows, type_id)
        
        if type_id == "AC":
            prediction = predict_air_compressor(features)
        elif type_id == "CNC":
            prediction = predict_milling(features)
        elif type_id == "TE":
            prediction = predict_turbofan(features)
        else:
            prediction = {"probFailure": 0.0, "riskLevel": "unknown", "confidence": 0.0}
    except Exception as e:
        return Response({"detail": f"ML prediction failed: {str(e)}"}, status=400)

    # Check for alerts
    check_and_send_alert(request.user, machine.machine_id, machine.name, prediction)

    return Response({
        "equipmentId": machine.machine_id,
        "equipmentName": machine.name,
        "type": type_id,
        "dataRowsProcessed": len(sensor_rows),
        **prediction,
    })