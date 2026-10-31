from django.contrib import admin

from .models import Hospital


@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    list_display = ("name", "short_name", "beds_available", "active")
    list_editable = ("beds_available", "active")
