"""Root URL routing. REST endpoints live under /api/ (plan §5.3)."""

from django.conf import settings
from django.contrib import admin
from django.urls import path, re_path
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from ai import views as ai_views
from hospitals.views import HospitalDetailView, HospitalListView
from incidents import views
from sms import views as sms_views

urlpatterns = [
    path("admin/", admin.site.urls),
    # Phase 0 wiring
    path("api/health/", views.health, name="health"),
    path("api/ping/", views.ping, name="ping"),
    # Phase 1 core alert loop
    path("api/reports/", views.ReportCreateView.as_view(), name="report-create"),
    path("api/reports/<uuid:pk>/", views.ReportDetailView.as_view(), name="report-detail"),
    path("api/incidents/", views.IncidentListView.as_view(), name="incident-list"),
    path("api/incidents/nearby-check/", views.NearbyCheckView.as_view(), name="nearby-check"),
    path("api/incidents/<uuid:pk>/dispatch/", views.IncidentDispatchView.as_view(), name="incident-dispatch"),
    path("api/incidents/<uuid:pk>/resolve/", views.IncidentResolveView.as_view(), name="incident-resolve"),
    path("api/incidents/by-short/<str:short_id>/", views.IncidentByShortView.as_view(), name="incident-by-short"),
    path("api/incidents/<uuid:pk>/", views.IncidentDetailView.as_view(), name="incident-detail"),
    # Phase 5 AI layer
    path("api/reports/<uuid:pk>/photo/", ai_views.ReportPhotoView.as_view(), name="report-photo"),
    path("api/metrics/", ai_views.MetricsView.as_view(), name="metrics"),
    path("api/profile-photo/", views.ProfilePhotoView.as_view(), name="profile-photo"),
    path("api/reports/<uuid:pk>/profile-photo/", views.ReportProfilePhotoView.as_view(), name="report-profile-photo"),
    path("api/hospitals/", HospitalListView.as_view(), name="hospital-list"),
    path("api/hospitals/<int:pk>/", HospitalDetailView.as_view(), name="hospital-detail"),
    # Phase 3 offline SMS channel
    path("api/sms/webhook/<str:token>/", sms_views.SmsWebhookView.as_view(), name="sms-webhook"),
    path("api/sms/logs/", sms_views.SmsLogListView.as_view(), name="sms-logs"),
    # API docs (Swagger UI: try every endpoint from the browser)
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

# Demo scope (plan Phase 0 step 4): uploaded scene photos are served by Django in every environment so the
# dashboard thumbnail works on the deployed backend. File names are random UUIDs; use object storage if this ever
# holds real data.
def media(request, path):
    return serve(request, path, document_root=settings.MEDIA_ROOT)  # read lazily (tests override it)


urlpatterns += [re_path(r"^media/(?P<path>.*)$", media)]
