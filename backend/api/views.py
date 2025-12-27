from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from .services.synthetic import generate_timeseries
from .models import Machine, MachineType, UserMachine
from django.shortcuts import get_object_or_404

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
    username = request.data.get("username")
    email = request.data.get("email", "")
    password = request.data.get("password")

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


# @api_view(["GET"])
# @permission_classes([IsAuthenticated])
# def synthetic_data(request):
#     payload = generate_timeseries(hours=100)
#     return Response(payload)


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
    user_machines = UserMachine.objects.filter(user=request.user).select_related('machine', 'machine__type')
    
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
            "health": "good" # Default health, or you can add a health field to UserMachine later
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