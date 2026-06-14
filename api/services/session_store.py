"""In-memory session storage with per-session stream locking.

For production, replace InMemorySessionStore with a Redis-backed implementation.
The Protocol interface keeps route handlers decoupled from storage details.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol

import pandas as pd

from agent.context import AgentContext
from api.exceptions import SessionNotFoundError, StreamBusyError


@dataclass
class Session:
    """Server-side conversation state for one client session."""

    id: str
    context: AgentContext
    message_history: list = field(default_factory=list)
    is_streaming: bool = False
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class SessionStore(Protocol):
    async def create(
        self, datasets: dict[str, pd.DataFrame], dataset_info: str
    ) -> Session: ...
    async def get(self, session_id: str) -> Session | None: ...
    async def delete(self, session_id: str) -> bool: ...
    async def acquire_stream(self, session_id: str) -> Session: ...
    async def release_stream(self, session_id: str) -> None: ...


class InMemorySessionStore:
    """Dict-backed session store — sufficient for case study, not for multi-worker prod."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    async def create(
        self, datasets: dict[str, pd.DataFrame], dataset_info: str
    ) -> Session:
        session_id = str(uuid.uuid4())
        context = AgentContext(datasets=datasets, dataset_info=dataset_info)
        session = Session(id=session_id, context=context)
        self._sessions[session_id] = session
        return session

    async def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    async def delete(self, session_id: str) -> bool:
        return self._sessions.pop(session_id, None) is not None

    async def acquire_stream(self, session_id: str) -> Session:
        session = self._sessions.get(session_id)
        if session is None:
            raise SessionNotFoundError(session_id)
        async with session.lock:
            if session.is_streaming:
                raise StreamBusyError(session_id)
            session.is_streaming = True
        return session

    async def release_stream(self, session_id: str) -> None:
        session = self._sessions.get(session_id)
        if session is None:
            return
        async with session.lock:
            session.is_streaming = False
