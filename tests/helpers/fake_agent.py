"""Test doubles for PydanticAI agent streaming."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock


async def _async_iter(items: list[Any]) -> AsyncIterator[Any]:
    for item in items:
        yield item


def make_fake_run_stream(events: list[Any], final_output: str = "Done."):
    """Return a mock agent whose run_stream yields predefined events."""

    @asynccontextmanager
    async def run_stream(*args, **kwargs):
        handler: Callable | None = kwargs.get("event_stream_handler")

        async def _emit() -> None:
            if handler is None:
                return
            ctx = MagicMock()

            async def event_gen():
                for event in events:
                    yield event

            await handler(ctx, event_gen())

        run = MagicMock()
        run.stream_text = lambda delta=False: _async_iter([final_output])
        run.all_messages = MagicMock(return_value=[])

        emit_task = asyncio.create_task(_emit())
        try:
            yield run
        finally:
            await emit_task

    agent = MagicMock()
    agent.run_stream = run_stream
    agent.run = AsyncMock()
    return agent
