"""Test doubles for PydanticAI agent streaming."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Any
from unittest.mock import MagicMock

from pydantic_ai.messages import PartDeltaEvent, TextPartDelta


def make_fake_agent(
    events: list[Any],
    final_text_chunks: list[str] | None = None,
):
    """Return a mock agent whose run() streams events through the handler.

    `events` are emitted first (e.g. thinking deltas, tool calls/results), then
    each string in `final_text_chunks` is emitted as a TextPartDelta — modeling
    how agent.run delivers the full final answer through the handler exactly once.
    """
    text_chunks = final_text_chunks if final_text_chunks is not None else ["Done."]
    text_events = [
        PartDeltaEvent(index=0, delta=TextPartDelta(content_delta=c)) for c in text_chunks
    ]
    all_events = list(events) + text_events

    async def run(*args, **kwargs):
        handler: Callable | None = kwargs.get("event_stream_handler")
        if handler is not None:
            ctx = MagicMock()

            async def event_gen() -> AsyncIterator[Any]:
                for event in all_events:
                    yield event

            await handler(ctx, event_gen())

        result = MagicMock()
        result.all_messages = MagicMock(return_value=[])
        return result

    agent = MagicMock()
    agent.run = run
    return agent
