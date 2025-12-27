from django.contrib import admin
from .models import *


@admin.register(MachineType)
class MachineTypeAdmin(admin.ModelAdmin):
    list_display = ('type_id', 'name')
    search_fields = ('name',)

@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = ('machine_id', 'name', 'type', 'date_added')
    list_filter = ('type', 'date_added')
    search_fields = ('name', 'machine_id')
    readonly_fields = ('machine_id', 'date_added')  # Prevent editing auto-generated fields

@admin.register(UserMachine)
class UserMachineAdmin(admin.ModelAdmin):
    list_display = ('user', 'machine', 'nickname', 'is_tracking', 'created_at')
    list_filter = ('is_tracking', 'user')
    search_fields = ('user__username', 'machine__name', 'nickname')

@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ('machine', 'severity', 'timestamp', 'acknowledged', 'created_for')
    list_filter = ('severity', 'acknowledged', 'timestamp')
    search_fields = ('machine__name', 'description')
