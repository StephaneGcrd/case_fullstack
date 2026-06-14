import pandas as pd
import pytest

from api.exceptions import SessionNotFoundError, StreamBusyError
from api.services.session_store import InMemorySessionStore


@pytest.fixture
def store() -> InMemorySessionStore:
    return InMemorySessionStore()


@pytest.fixture
def sample_datasets():
    df = pd.DataFrame({"price": [1, 2, 3]})
    return {"cars": df}, "- **cars** (3 rows, 1 columns)"


@pytest.mark.asyncio
async def test_create_returns_session_with_context(store, sample_datasets):
    datasets, info = sample_datasets
    session = await store.create(datasets, info)
    assert session.id
    assert session.context.datasets is datasets
    assert session.message_history == []
    assert session.is_streaming is False


@pytest.mark.asyncio
async def test_get_unknown_session_returns_none(store):
    assert await store.get("missing") is None


@pytest.mark.asyncio
async def test_delete_removes_session(store, sample_datasets):
    datasets, info = sample_datasets
    session = await store.create(datasets, info)
    assert await store.delete(session.id) is True
    assert await store.get(session.id) is None


@pytest.mark.asyncio
async def test_acquire_stream_sets_flag(store, sample_datasets):
    datasets, info = sample_datasets
    session = await store.create(datasets, info)
    acquired = await store.acquire_stream(session.id)
    assert acquired.is_streaming is True


@pytest.mark.asyncio
async def test_acquire_stream_raises_409_when_busy(store, sample_datasets):
    datasets, info = sample_datasets
    session = await store.create(datasets, info)
    await store.acquire_stream(session.id)
    with pytest.raises(StreamBusyError):
        await store.acquire_stream(session.id)


@pytest.mark.asyncio
async def test_release_stream_clears_flag(store, sample_datasets):
    datasets, info = sample_datasets
    session = await store.create(datasets, info)
    await store.acquire_stream(session.id)
    await store.release_stream(session.id)
    updated = await store.get(session.id)
    assert updated is not None
    assert updated.is_streaming is False


@pytest.mark.asyncio
async def test_acquire_unknown_session_raises(store):
    with pytest.raises(SessionNotFoundError):
        await store.acquire_stream("missing")
