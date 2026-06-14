import pytest

from api.dependencies import get_agent_factory
from tests.helpers.fake_agent import make_fake_run_stream
from tests.helpers.sse_parser import parse_sse


def test_chat_stream_returns_sse_events(client, monkeypatch):
    created = client.post("/sessions").json()
    session_id = created["session_id"]

    fake_agent = make_fake_run_stream(
        [],
        stream_text_chunks=["<thinking>plan</thinking>", "Answer."],
    )

    app = client.app
    app.dependency_overrides[get_agent_factory] = lambda: lambda info: fake_agent

    with client.stream(
        "POST",
        f"/sessions/{session_id}/chat",
        json={"message": "Hello"},
    ) as response:
        assert response.status_code == 200
        raw = "".join(response.iter_text())
        events = parse_sse(raw)
        types = [t for t, _ in events]
        assert "run_start" in types
        assert "thinking_delta" in types
        assert "text_delta" in types
        assert "done" in types


@pytest.mark.asyncio
async def test_chat_returns_409_when_busy(client, session_store):
    created = client.post("/sessions").json()
    session_id = created["session_id"]

    session = await session_store.get(session_id)
    assert session is not None
    session.is_streaming = True

    response = client.post(f"/sessions/{session_id}/chat", json={"message": "Hi"})
    assert response.status_code == 409
