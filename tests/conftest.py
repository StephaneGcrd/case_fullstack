"""Shared pytest fixtures for API tests."""

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_artifact_store, get_session_store
from api.main import create_app
from api.services.artifact_store import InMemoryArtifactStore
from api.services.session_store import InMemorySessionStore


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def session_store() -> InMemorySessionStore:
    return InMemorySessionStore()


@pytest.fixture
def artifact_store() -> InMemoryArtifactStore:
    return InMemoryArtifactStore()


@pytest.fixture
def client(session_store, artifact_store) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_session_store] = lambda: session_store
    app.dependency_overrides[get_artifact_store] = lambda: artifact_store
    return TestClient(app)
