"""Error envelope from plan §5.3: {"error": "code", "detail": "..."}."""

from rest_framework import status
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None
    code = {
        status.HTTP_400_BAD_REQUEST: "validation_error",
        status.HTTP_404_NOT_FOUND: "not_found",
        status.HTTP_405_METHOD_NOT_ALLOWED: "method_not_allowed",
    }.get(response.status_code, "error")
    detail = response.data.get("detail") if isinstance(response.data, dict) and "detail" in response.data else response.data
    response.data = {"error": code, "detail": detail}
    return response
