"""JSON response that replaces non-finite floats (inf/-inf/nan) with null.

Starlette's default JSONResponse renders with allow_nan=False, so returning
a float('inf') PSNR (e.g. a perfectly reconstructed block, or a "lossless"
mode request) raises inside response rendering instead of serializing —
IEEE infinity/NaN aren't valid JSON either way, so mapping them to null here
is what keeps the wire format spec-compliant instead of crashing.
"""

import math
from typing import Any

from fastapi.responses import JSONResponse


def _sanitize(value: Any) -> Any:
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize(v) for v in value]
    return value


class SafeJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        return super().render(_sanitize(content))
