"""Stateful parser that splits LLM text deltas into thinking vs answer channels.

The agent system prompt requires reasoning inside <thinking> tags. This parser
incrementally consumes streamed text and emits typed SSE events. It handles
tags split across multiple deltas via a carry buffer.
"""

from __future__ import annotations

from enum import Enum, auto

from api.streaming.events import SSEEventType

# Tags enforced by agent/prompt.py — keep in sync if prompt changes.
OPEN_TAG = "<thinking>"
CLOSE_TAG = "</thinking>"


class _State(Enum):
    OUTSIDE = auto()
    IN_THINKING = auto()


class ThinkingParser:
    """Convert raw text deltas into thinking/text SSE events."""

    def __init__(self) -> None:
        self._state = _State.OUTSIDE
        # Holds a partial tag prefix when a delta ends mid-tag.
        self._carry = ""

    def feed(self, chunk: str) -> list[tuple[str, dict]]:
        """Process a text delta and return zero or more SSE events."""
        text = self._carry + chunk
        self._carry = ""
        events: list[tuple[str, dict]] = []
        i = 0

        while i < len(text):
            if self._state is _State.OUTSIDE:
                open_idx = text.find(OPEN_TAG, i)
                if open_idx == -1:
                    segment, carry = self._take_until_possible_tag(text[i:])
                    if segment:
                        events.append((SSEEventType.TEXT_DELTA, {"delta": segment}))
                    self._carry = carry
                    break
                if open_idx > i:
                    events.append(
                        (SSEEventType.TEXT_DELTA, {"delta": text[i:open_idx]})
                    )
                events.append((SSEEventType.THINKING_START, {}))
                self._state = _State.IN_THINKING
                i = open_idx + len(OPEN_TAG)
            else:
                close_idx = text.find(CLOSE_TAG, i)
                if close_idx == -1:
                    segment, carry = self._take_until_possible_tag(text[i:])
                    if segment:
                        events.append(
                            (SSEEventType.THINKING_DELTA, {"delta": segment})
                        )
                    self._carry = carry
                    break
                if close_idx > i:
                    events.append(
                        (SSEEventType.THINKING_DELTA, {"delta": text[i:close_idx]})
                    )
                events.append((SSEEventType.THINKING_END, {}))
                self._state = _State.OUTSIDE
                i = close_idx + len(CLOSE_TAG)

        return events

    def flush(self) -> list[tuple[str, dict]]:
        """Emit any remaining buffered text at end of stream."""
        if not self._carry:
            return []
        delta_type = (
            SSEEventType.THINKING_DELTA
            if self._state is _State.IN_THINKING
            else SSEEventType.TEXT_DELTA
        )
        events = [(delta_type, {"delta": self._carry})]
        self._carry = ""
        return events

    @staticmethod
    def _take_until_possible_tag(text: str) -> tuple[str, str]:
        """Split text into safe-to-emit content and a possible partial tag suffix."""
        max_suffix = max(len(OPEN_TAG), len(CLOSE_TAG)) - 1
        for suffix_len in range(min(max_suffix, len(text)), 0, -1):
            suffix = text[-suffix_len:]
            if OPEN_TAG.startswith(suffix) or CLOSE_TAG.startswith(suffix):
                return text[:-suffix_len], suffix
        return text, ""
