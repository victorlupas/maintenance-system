from django.db import models
from django.db import transaction

class MachineType(models.Model):
    type_id = models.CharField(primary_key=True, max_length=50) # should start with the initial of the machine type (for CNC it starts with C)
    name = models.CharField(unique=True, max_length=100)

    def __str__(self):
        return self.type_ID


class Machines(models.Model):
    machine_id = models.CharField(max_length=45, primary_key=True, editable=False)
    type_id = models.ForeignKey(MachineType, on_delete=models.CASCADE)
    name = models.CharField(max_length=45)
    date_added = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # Only generate ID if it doesn't exist yet (creating a new object)
        if not self.machine_id:
            self.machine_id = self.generate_next_id()
        
        super().save(*args, **kwargs)

    def generate_next_id(self):
        # 1. Filter for all machines of THIS specific type (e.g., only 'C' machines)
        # 2. Order by machine_id descending to get the last one created
        last_machine = Machines.objects.filter(
            type_id=self.type_id
        ).order_by('-machine_id').first()

        if last_machine:
            # If a machine exists (e.g., C-009), extract the '009' part
            # split('-') gives ['C', '009'], [-1] takes the last part
            last_seq = int(last_machine.machine_id.split('-')[-1])
            new_seq = last_seq + 1
        else:
            # If this is the first machine of this type
            new_seq = 1

        # Format: Type + Hyphen + 3 digits (padded with zeros)
        # {self.type_id.type_id} accesses the actual string value of the FK
        return f"{self.type_id.type_id}-{new_seq:03d}"

    def __str__(self):
        return self.machine_id
    

class Users(models.Model):
    user_id = models.IntegerField(primary_key=True)
    machine_id = models.ForeignKey(Machines, on_delete=models.CASCADE)
    username = models.CharField(unique=True, max_length=50)
    email = models.CharField(unique=True, max_length=50)


class Alerts(models.Model):
    machine_id = models.ForeignKey(Users, on_delete=models.CASCADE, related_name="for_machine")
    username = models.ForeignKey(Users, on_delete=models.CASCADE, related_name="for_user")
    description = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
