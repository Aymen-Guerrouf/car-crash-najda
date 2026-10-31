from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from incidents.serializers import HospitalSerializer

from .models import Hospital


class HospitalListView(APIView):
    @extend_schema(tags=["hospitals"], summary="List hospitals", responses=HospitalSerializer(many=True))
    def get(self, request):
        return Response(HospitalSerializer(Hospital.objects.all(), many=True).data)


class HospitalUpdateSerializer(serializers.Serializer):
    """The only fields an operator changes from the dashboard (plan §5.3). Anything else in the body is ignored."""

    beds_available = serializers.IntegerField(min_value=0, max_value=9999, required=False)
    active = serializers.BooleanField(required=False)


class HospitalDetailView(APIView):
    @extend_schema(
        tags=["hospitals"],
        summary="Update a hospital's available beds / active flag (dashboard)",
        description="Partial update. `beds_available` feeds the hospital recommendation; `active=false` removes the hospital from it.",
        request=HospitalUpdateSerializer,
        responses={200: HospitalSerializer, 400: OpenApiResponse(description="validation_error"), 404: OpenApiResponse(description="Unknown hospital")},
    )
    def patch(self, request, pk):
        hospital = get_object_or_404(Hospital, pk=pk)
        serializer = HospitalUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(hospital, field, value)
        hospital.save(update_fields=list(serializer.validated_data) or None)
        return Response(HospitalSerializer(hospital).data)
