import json

from api.streaming.events import SSEEventType
from api.streaming.sse import encode_event


def test_encode_event_produces_valid_sse_format():
    result = encode_event(SSEEventType.TEXT_DELTA, {"delta": "hello"})
    assert result == 'event: text_delta\ndata: {"delta": "hello"}\n\n'


def test_encode_event_handles_empty_data():
    result = encode_event(SSEEventType.THINKING_START, {})
    assert result == "event: thinking_start\ndata: {}\n\n"


def test_encode_event_serializes_nested_data():
    payload = {"tool_call_id": "tc1", "args": {"sql": "SELECT 1"}}
    result = encode_event(SSEEventType.TOOL_CALL_START, payload)
    parsed = json.loads(result.split("data: ")[1].strip())
    assert parsed["args"]["sql"] == "SELECT 1"
