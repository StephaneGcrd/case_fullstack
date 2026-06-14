"""SSE event type constants — single source of truth for wire protocol."""

from enum import StrEnum


class SSEEventType(StrEnum):
    """Custom SSE event types sent to the React client."""

    RUN_START = "run_start"
    STATUS = "status"
    THINKING_START = "thinking_start"
    THINKING_DELTA = "thinking_delta"
    THINKING_END = "thinking_end"
    TOOL_CALL_START = "tool_call_start"
    TOOL_CALL_DELTA = "tool_call_delta"
    TOOL_RESULT = "tool_result"
    VISUALIZATION = "visualization"
    TEXT_DELTA = "text_delta"
    ERROR = "error"
    DONE = "done"
