"""Parse SSE wire format into structured events for assertions in tests."""

from __future__ import annotations

import json


def parse_sse(raw: str) -> list[tuple[str, dict]]:
    """Parse SSE text into a list of (event_type, data_dict) tuples."""
    events: list[tuple[str, dict]] = []
    current_event: str | None = None

    for line in raw.splitlines():
        if line.startswith("event: "):
            current_event = line.removeprefix("event: ").strip()
        elif line.startswith("data: ") and current_event is not None:
            data = json.loads(line.removeprefix("data: ").strip())
            events.append((current_event, data))
            current_event = None

    return events
