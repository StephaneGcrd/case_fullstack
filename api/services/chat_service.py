"""Orchestrate agent.run_stream and yield encoded SSE events."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator

from pydantic_ai import Agent

from agent.context import AgentContext
from api.exceptions import SessionNotFoundError
from api.services.artifact_store import ArtifactStore
from api.services.session_store import SessionStore
from api.streaming.events import SSEEventType
from api.streaming.sse import encode_event
from api.streaming.translator import StreamTranslator


class ChatService:
    """Bridge between PydanticAI agent runs and SSE streaming."""

    def __init__(
        self,
        session_store: SessionStore,
        artifact_store: ArtifactStore,
    ) -> None:
        self._session_store = session_store
        self._artifact_store = artifact_store

    async def stream_chat(
        self,
        session_id: str,
        message: str,
        agent: Agent[AgentContext],
    ) -> AsyncGenerator[str, None]:
        """Run the agent and yield SSE-encoded event strings."""
        session = await self._session_store.get(session_id)
        if session is None:
            raise SessionNotFoundError(session_id)

        run_id = str(uuid.uuid4())
        translator = StreamTranslator(session_id, self._artifact_store)
        queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue()

        async def event_stream_handler(ctx, event_stream) -> None:
            async for event in event_stream:
                for sse_event in translator.translate(event):
                    await queue.put(sse_event)
            for sse_event in translator.flush():
                await queue.put(sse_event)

        yield encode_event(SSEEventType.RUN_START, {"run_id": run_id})

        async def _run() -> None:
            try:
                async with agent.run_stream(
                    message,
                    deps=session.context,
                    message_history=session.message_history or None,
                    event_stream_handler=event_stream_handler,
                ) as run:
                    async for _ in run.stream_text(delta=True):
                        pass
                    session.message_history = run.all_messages()
            except Exception as exc:
                await queue.put((SSEEventType.ERROR, {"message": str(exc)}))

        task = asyncio.create_task(_run())
        try:
            while not task.done() or not queue.empty():
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=0.05)
                except asyncio.TimeoutError:
                    continue
                if item is not None:
                    yield encode_event(*item)
            await task
        finally:
            await self._session_store.release_stream(session_id)
            yield encode_event(SSEEventType.DONE, {"session_id": session_id})
