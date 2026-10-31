from django.contrib import admin

from .models import AiCall


@admin.register(AiCall)
class AiCallAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "provider", "model", "ok", "error", "ms", "first_token_ms")
    list_filter = ("kind", "ok", "provider")
