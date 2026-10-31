from django.contrib import admin

from .models import SmsLog


@admin.register(SmsLog)
class SmsLogAdmin(admin.ModelAdmin):
    list_display = ("direction", "phone", "incident", "error", "at")
    list_filter = ("direction",)
