"""FastAPI dependency injection — swap stores here for tests."""

from __future__ import annotations

from typing import Callable

from agent.agent import create_agent
from agent.context import AgentContext
from pydantic_ai import Agent

from api.services.artifact_store import ArtifactStore, InMemoryArtifactStore
from api.services.session_store import InMemorySessionStore, SessionStore

_session_store = InMemorySessionStore()
_artifact_store = InMemoryArtifactStore()


def get_session_store() -> SessionStore:
    return _session_store


def get_artifact_store() -> ArtifactStore:
    return _artifact_store


def get_agent_factory() -> Callable[[str], Agent[AgentContext]]:
    return create_agent
