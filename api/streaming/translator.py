"""Translate PydanticAI stream events into our custom SSE event tuples."""

from __future__ import annotations

from typing import Any

from pydantic_ai import AgentStreamEvent
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPartDelta,
)

from api.services.artifact_store import ArtifactStore
from api.streaming.events import SSEEventType
from api.streaming.thinking_parser import ThinkingParser

SSEEvent = tuple[str, dict[str, Any]]


class StreamTranslator:
    """Maps one PydanticAI event to zero or more SSE events."""

    def __init__(self, session_id: str, artifact_store: ArtifactStore) -> None:
        self._session_id = session_id
        self._artifact_store = artifact_store
        self._thinking_parser = ThinkingParser()
        # Remember last tool call metadata to enrich visualize results.
        self._pending_tool_args: dict[str, dict[str, Any]] = {}

    def translate(
        self,
        event: AgentStreamEvent,
        tool_name: str | None = None,
        tool_args: dict[str, Any] | None = None,
    ) -> list[SSEEvent]:
        if isinstance(event, PartStartEvent):
            return self._translate_part_start(event)
        if isinstance(event, PartDeltaEvent):
            return self._translate_part_delta(event)
        if isinstance(event, FunctionToolCallEvent):
            return self._translate_tool_call(event)
        if isinstance(event, FunctionToolResultEvent):
            return self._translate_tool_result(event, tool_name, tool_args)
        return []

    def _translate_part_start(self, event: PartStartEvent) -> list[SSEEvent]:
        # Tool-calling turns emit their text (incl. <thinking>) via the event
        # handler. Anthropic starts text parts empty, but feed any initial
        # content through the parser so no reasoning is lost on other providers.
        if isinstance(event.part, TextPart) and event.part.content:
            return self._thinking_parser.feed(event.part.content)
        return []

    def feed_text(self, chunk: str) -> list[SSEEvent]:
        """Convert streamed assistant text into thinking/text SSE events."""
        return self._thinking_parser.feed(chunk)

    def flush_text(self) -> list[SSEEvent]:
        """Flush thinking parser buffer after stream_text completes."""
        return self._thinking_parser.flush()

    def _translate_part_delta(self, event: PartDeltaEvent) -> list[SSEEvent]:
        # Text from tool-calling turns (the agent's <thinking> blocks) arrives
        # here; the final answer's text comes via run.stream_text(). Feed both
        # through the same parser. The handler breaks at FinalResultEvent before
        # the final answer's deltas, so there is no duplication.
        if isinstance(event.delta, TextPartDelta):
            return self._thinking_parser.feed(event.delta.content_delta)
        if isinstance(event.delta, ToolCallPartDelta):
            return [
                (
                    SSEEventType.TOOL_CALL_DELTA,
                    {
                        "tool_call_id": event.delta.tool_call_id,
                        "args_delta": event.delta.args_delta,
                    },
                )
            ]
        return []

    def _translate_tool_call(self, event: FunctionToolCallEvent) -> list[SSEEvent]:
        part = event.part
        args = part.args if isinstance(part.args, dict) else {}
        self._pending_tool_args[part.tool_call_id] = args
        return [
            (
                SSEEventType.TOOL_CALL_START,
                {
                    "tool_call_id": part.tool_call_id,
                    "tool_name": part.tool_name,
                    "args": args,
                },
            )
        ]

    def _translate_tool_result(
        self,
        event: FunctionToolResultEvent,
        tool_name: str | None,
        tool_args: dict[str, Any] | None,
    ) -> list[SSEEvent]:
        part = event.part
        name = tool_name or part.tool_name
        content = str(part.content)
        events: list[SSEEvent] = [
            (
                SSEEventType.TOOL_RESULT,
                {
                    "tool_call_id": part.tool_call_id,
                    "tool_name": name,
                    "content": content,
                },
            )
        ]
        if name == "visualize":
            args = tool_args or self._pending_tool_args.get(part.tool_call_id, {})
            title = str(args.get("title", "Visualization"))
            artifact_type = args.get("result_type", "figure")
            artifact_id = self._artifact_store.register_from_tool_result(
                content=content,
                title=title,
                artifact_type=artifact_type,
                session_id=self._session_id,
            )
            if artifact_id:
                events.append(
                    (
                        SSEEventType.VISUALIZATION,
                        {
                            "artifact_id": artifact_id,
                            "title": title,
                            "type": artifact_type,
                            "url": f"/artifacts/{artifact_id}",
                        },
                    )
                )
        return events
