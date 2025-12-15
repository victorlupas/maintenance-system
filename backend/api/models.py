from django.db import models, transaction
from django.contrib.auth.models import User


class MachineType(models.Model):
    """
    Machine category/type (e.g., CNC, Pump, Milling).
    type_id is the short code used for machine ID generation (e.g., 'C', 'P', 'M').
    """
    type_id = models.CharField(primary_key=True, max_length=50)
    name = models.CharField(unique=True, max_length=100)

    def __str__(self) -> str:
        return f"{self.type_id} - {self.name}"


class Machine(models.Model):
    """
    Individual machine. machine_id is generated like: C-001, C-002, P-001...
    It increments per MachineType.
    """
    machine_id = models.CharField(max_length=45, primary_key=True, editable=False)
    type = models.ForeignKey(MachineType, on_delete=models.CASCADE, related_name="machines")
    name = models.CharField(max_length=100)
    date_added = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.machine_id} ({self.name})"

    def save(self, *args, **kwargs):
        # Generate ID only when creating new object
        if not self.machine_id:
            self.machine_id = self.generate_next_id()
        super().save(*args, **kwargs)

    @transaction.atomic
    def generate_next_id(self) -> str:
        """
        Safely generate the next machine_id for this type.
        Example: for type 'C', create C-001, then C-002, ...
        """
        # Lock rows to reduce race conditions (works best on real DBs like Postgres/MySQL)
        last_machine = (
            Machine.objects.select_for_update()
            .filter(type=self.type)
            .order_by("-machine_id")
            .first()
        )

        if last_machine:
            last_seq = int(last_machine.machine_id.split("-")[-1])
            new_seq = last_seq + 1
        else:
            new_seq = 1

        return f"{self.type.type_id}-{new_seq:03d}"


class UserMachine(models.Model):
    """
    Many-to-many relationship between User and Machine with extra fields:
    - nickname: per-user nickname for that machine
    - is_tracking: whether user actively tracks it
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tracked_machines")
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name="tracked_by")

    nickname = models.CharField(max_length=100, blank=True, default="")
    is_tracking = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "machine")

    def __str__(self) -> str:
        display = self.nickname.strip() or self.machine.name
        return f"{self.user.username} -> {self.machine.machine_id} ({display})"


class Alert(models.Model):
    """
    Alert tied to a machine. Optionally addressed to a specific user (created_for).
    If created_for is NULL, alert is considered machine-wide (visible to all trackers).
    """
    SEVERITY_CHOICES = (
        ("info", "Info"),
        ("warning", "Warning"),
        ("critical", "Critical"),
    )

    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name="alerts")
    created_for = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="alerts"
    )

    description = models.TextField()
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default="warning")
    timestamp = models.DateTimeField(auto_now_add=True)
    acknowledged = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"[{self.severity.upper()}] {self.machine.machine_id} - {self.description[:40]}"
