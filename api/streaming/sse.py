"""Encode structured events into SSE wire format."""

from __future__ import annotations

import json
from typing import Any


def encode_event(event_type: str, data: dict[str, Any]) -> str:
    """Format a single SSE event string.

    Args:
        event_type: The SSE event name (e.g. "text_delta").
        data: JSON-serializable payload dict.

    Returns:
        A complete SSE message block ready to yield from a StreamingResponse.
    """
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
