from django.contrib import admin

from .models import SensorReading


@admin.register(SensorReading)
class SensorReadingAdmin(admin.ModelAdmin):
    list_display = ("device_id", "sequence", "source", "magnitude_g", "possible_collision", "review_status", "received_at")
    list_filter = ("source", "possible_collision", "review_status")
