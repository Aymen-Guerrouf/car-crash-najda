from django.contrib import admin

from .models import Incident, Report


class ReportInline(admin.TabularInline):
    model = Report
    extra = 0
    fields = ("role", "channel", "triage", "answers_code", "received_at")
    readonly_fields = fields
    show_change_link = True


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = ("short_id", "status", "worst_triage", "is_mci", "hospital", "created_at")
    list_filter = ("status", "worst_triage", "is_mci")
    search_fields = ("short_id",)
    inlines = [ReportInline]


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("incident", "role", "channel", "triage", "received_at")
    list_filter = ("role", "channel", "triage")
