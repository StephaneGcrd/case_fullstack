import pytest

from api.services.artifact_store import InMemoryArtifactStore
from api.services.chat_service import ChatService
from api.services.session_store import InMemorySessionStore
from api.streaming.events import SSEEventType
from tests.helpers.fake_agent import make_fake_run_stream
from tests.helpers.sse_parser import parse_sse


@pytest.mark.asyncio
async def test_stream_chat_yields_run_start_and_text_delta():
    session_store = InMemorySessionStore()
    artifact_store = InMemoryArtifactStore()
    datasets = {"cars": __import__("pandas").DataFrame({"price": [1]})}
    session = await session_store.create(datasets, "info")
    await session_store.acquire_stream(session.id)

    agent = make_fake_run_stream([], stream_text_chunks=["Hello"])
    service = ChatService(session_store=session_store, artifact_store=artifact_store)

    raw = ""
    async for sse in service.stream_chat(session.id, "Hi", agent=agent):
        raw += sse

    events = parse_sse(raw)
    types = [t for t, _ in events]
    assert SSEEventType.RUN_START in types
    assert SSEEventType.TEXT_DELTA in types
    assert SSEEventType.DONE in types


@pytest.mark.asyncio
async def test_stream_chat_releases_lock_on_completion():
    session_store = InMemorySessionStore()
    artifact_store = InMemoryArtifactStore()
    session = await session_store.create({}, "info")
    await session_store.acquire_stream(session.id)

    agent = make_fake_run_stream([])
    service = ChatService(session_store=session_store, artifact_store=artifact_store)
    async for _ in service.stream_chat(session.id, "Hi", agent=agent):
        pass

    updated = await session_store.get(session.id)
    assert updated is not None
    assert updated.is_streaming is False
