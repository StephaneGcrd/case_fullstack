# FastAPI SSE API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a FastAPI backend that streams PydanticAI agent activity (thinking, tool calls, text, visualizations) to clients via custom SSE events, with server-side sessions and TDD throughout.

**Architecture:** Layered modules under `api/` — routes call services, services orchestrate the agent, streaming layer translates PydanticAI events into typed SSE. In-memory stores for sessions and artifacts. Agent code in `agent/` stays unchanged.

**Tech Stack:** FastAPI, uvicorn, PydanticAI, pytest, pytest-asyncio, httpx

**Spec:** `docs/superpowers/specs/2026-06-14-fastapi-sse-api-design.md`

---

## File Map

| File | Responsibility |
|------|----------------|
| `api/streaming/events.py` | SSE event type constants |
| `api/streaming/sse.py` | Encode events to SSE wire format |
| `api/streaming/thinking_parser.py` | Stateful `<thinking>` tag parser |
| `api/streaming/translator.py` | PydanticAI events → SSE events |
| `api/services/session_store.py` | Session CRUD + stream lock |
| `api/services/artifact_store.py` | Artifact register + file read |
| `api/services/chat_service.py` | Agent run_stream orchestration |
| `api/services/dataset_loader.py` | Load CSVs (extracted from main.py) |
| `api/schemas.py` | Pydantic request/response models |
| `api/exceptions.py` | SessionNotFoundError, StreamBusyError, etc. |
| `api/dependencies.py` | FastAPI DI singletons |
| `api/routes/sessions.py` | POST/GET/DELETE /sessions |
| `api/routes/chat.py` | POST /sessions/{id}/chat → SSE |
| `api/routes/artifacts.py` | GET /artifacts/{id} |
| `api/main.py` | App factory, CORS, router mount |
| `tests/conftest.py` | Shared fixtures |
| `tests/helpers/sse_parser.py` | Parse SSE responses in tests |
| `tests/helpers/fake_agent.py` | Mock agent for integration tests |

---

### Task 0: Project Setup & Test Infrastructure

**Files:**
- Modify: `requirements.txt`
- Create: `pytest.ini`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Create: `tests/helpers/__init__.py`
- Create: `tests/helpers/sse_parser.py`

- [ ] **Step 1: Add dependencies to requirements.txt**

Append to `requirements.txt`:

```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
httpx>=0.28.0
pytest>=8.0.0
pytest-asyncio>=0.24.0
```

- [ ] **Step 2: Create pytest.ini**

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

- [ ] **Step 3: Create SSE test helper**

Create `tests/helpers/sse_parser.py`:

```python
"""Parse SSE wire format into structured events for assertions in tests."""

from __future__ import annotations

import json


def parse_sse(raw: str) -> list[tuple[str, dict]]:
    """Parse SSE text into a list of (event_type, data_dict) tuples."""
    events: list[tuple[str, dict]] = []
    current_event: str | None = None

    for line in raw.splitlines():
        if line.startswith("event: "):
            current_event = line.removeprefix("event: ").strip()
        elif line.startswith("data: ") and current_event is not None:
            data = json.loads(line.removeprefix("data: ").strip())
            events.append((current_event, data))
            current_event = None

    return events
```

- [ ] **Step 4: Create minimal conftest.py**

Create `tests/conftest.py`:

```python
"""Shared pytest fixtures for API tests."""

import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"
```

- [ ] **Step 5: Install dependencies and verify pytest runs**

Run: `pip install -r requirements.txt && pytest --co -q`
Expected: no tests collected yet, exit 0

- [ ] **Step 6: Commit**

```bash
git add requirements.txt pytest.ini tests/
git commit -m "chore: add test infrastructure and API dependencies"
```

---

### Task 1: SSE Event Constants & Encoder

**Files:**
- Create: `api/__init__.py`
- Create: `api/streaming/__init__.py`
- Create: `api/streaming/events.py`
- Create: `api/streaming/sse.py`
- Create: `tests/unit/test_sse.py`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_sse.py`:

```python
import json

from api.streaming.events import SSEEventType
from api.streaming.sse import encode_event


def test_encode_event_produces_valid_sse_format():
    result = encode_event(SSEEventType.TEXT_DELTA, {"delta": "hello"})
    assert result == 'event: text_delta\ndata: {"delta": "hello"}\n\n'


def test_encode_event_handles_empty_data():
    result = encode_event(SSEEventType.THINKING_START, {})
    assert result == "event: thinking_start\ndata: {}\n\n"


def test_encode_event_serializes_nested_data():
    payload = {"tool_call_id": "tc1", "args": {"sql": "SELECT 1"}}
    result = encode_event(SSEEventType.TOOL_CALL_START, payload)
    parsed = json.loads(result.split("data: ")[1].strip())
    assert parsed["args"]["sql"] == "SELECT 1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_sse.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api'`

- [ ] **Step 3: Write minimal implementation**

Create `api/__init__.py` (empty).

Create `api/streaming/__init__.py` (empty).

Create `api/streaming/events.py`:

```python
"""SSE event type constants — single source of truth for wire protocol."""

from enum import StrEnum


class SSEEventType(StrEnum):
    """Custom SSE event types sent to the React client."""

    RUN_START = "run_start"
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
```

Create `api/streaming/sse.py`:

```python
"""Encode structured events into SSE wire format."""

from __future__ import annotations

import json
from typing import Any


def encode_event(event_type: str, data: dict[str, Any]) -> str:
    """Format a single SSE event string.

    Args:
        event_type: The SSE event name (e.g. "text_delta").
        data: JSON-serializable payload dict.

    Returns:
        A complete SSE message block ready to yield from a StreamingResponse.
    """
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_sse.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add api/streaming/ tests/unit/test_sse.py
git commit -m "feat: add SSE event constants and encoder"
```

---

### Task 2: ThinkingParser

**Files:**
- Create: `api/streaming/thinking_parser.py`
- Create: `tests/unit/test_thinking_parser.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_thinking_parser.py`:

```python
from api.streaming.events import SSEEventType
from api.streaming.thinking_parser import ThinkingParser


def _types(events):
    return [e[0] for e in events]


def test_plain_text_emits_text_delta():
    parser = ThinkingParser()
    events = parser.feed("Hello world")
    assert events == [(SSEEventType.TEXT_DELTA, {"delta": "Hello world"})]


def test_thinking_block_emits_thinking_events():
    parser = ThinkingParser()
    events = parser.feed("<thinking>I need SQL</thinking>")
    assert events == [
        (SSEEventType.THINKING_START, {}),
        (SSEEventType.THINKING_DELTA, {"delta": "I need SQL"}),
        (SSEEventType.THINKING_END, {}),
    ]


def test_split_open_tag_across_deltas():
    parser = ThinkingParser()
    assert parser.feed("<thi") == []
    events = parser.feed("nking>plan</thinking>")
    assert (SSEEventType.THINKING_START, {}) in events
    assert (SSEEventType.THINKING_DELTA, {"delta": "plan"}) in events
    assert (SSEEventType.THINKING_END, {}) in events


def test_text_before_and_after_thinking():
    parser = ThinkingParser()
    events = parser.feed("prefix<thinking>reason</thinking>suffix")
    assert _types(events) == [
        SSEEventType.TEXT_DELTA,
        SSEEventType.THINKING_START,
        SSEEventType.THINKING_DELTA,
        SSEEventType.THINKING_END,
        SSEEventType.TEXT_DELTA,
    ]
    assert events[0] == (SSEEventType.TEXT_DELTA, {"delta": "prefix"})
    assert events[-1] == (SSEEventType.TEXT_DELTA, {"delta": "suffix"})


def test_split_close_tag_across_deltas():
    parser = ThinkingParser()
    parser.feed("<thinking>plan</thi")
    events = parser.feed("nking>after")
    assert (SSEEventType.THINKING_END, {}) in events
    assert (SSEEventType.TEXT_DELTA, {"delta": "after"}) in events


def test_flush_emits_remaining_buffer():
    parser = ThinkingParser()
    parser.feed("leftover")
    events = parser.flush()
    assert events == [(SSEEventType.TEXT_DELTA, {"delta": "leftover"})]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_thinking_parser.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write implementation**

Create `api/streaming/thinking_parser.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_thinking_parser.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add api/streaming/thinking_parser.py tests/unit/test_thinking_parser.py
git commit -m "feat: add stateful ThinkingParser for SSE thinking events"
```

---

### Task 3: SessionStore

**Files:**
- Create: `api/exceptions.py`
- Create: `api/services/__init__.py`
- Create: `api/services/session_store.py`
- Create: `tests/unit/test_session_store.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_session_store.py`:

```python
import asyncio

import pandas as pd
import pytest

from agent.context import AgentContext
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_session_store.py -v`
Expected: FAIL — import errors

- [ ] **Step 3: Write implementation**

Create `api/exceptions.py`:

```python
"""Domain exceptions mapped to HTTP status codes in route handlers."""


class SessionNotFoundError(Exception):
    """Raised when a session_id does not exist. Maps to HTTP 404."""


class StreamBusyError(Exception):
    """Raised when a chat stream is already active. Maps to HTTP 409."""


class ArtifactNotFoundError(Exception):
    """Raised when an artifact_id does not exist. Maps to HTTP 404."""


class ArtifactGoneError(Exception):
    """Raised when artifact metadata exists but file is missing. Maps to HTTP 410."""
```

Create `api/services/__init__.py` (empty).

Create `api/services/session_store.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_session_store.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add api/exceptions.py api/services/session_store.py tests/unit/test_session_store.py
git commit -m "feat: add in-memory SessionStore with stream locking"
```

---

### Task 4: ArtifactStore

**Files:**
- Create: `api/services/artifact_store.py`
- Create: `tests/unit/test_artifact_store.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_artifact_store.py`:

```python
from pathlib import Path

import pytest

from api.exceptions import ArtifactGoneError, ArtifactNotFoundError
from api.services.artifact_store import InMemoryArtifactStore


@pytest.fixture
def store() -> InMemoryArtifactStore:
    return InMemoryArtifactStore()


def test_register_returns_artifact_id(store, tmp_path: Path):
    filepath = tmp_path / "chart.html"
    filepath.write_text("<html>plot</html>")
    artifact_id = store.register(
        filepath=filepath,
        title="Price Chart",
        artifact_type="figure",
        session_id="sess-1",
    )
    assert artifact_id
    artifact = store.get(artifact_id)
    assert artifact is not None
    assert artifact.title == "Price Chart"
    assert artifact.type == "figure"


def test_read_content_returns_bytes(store, tmp_path: Path):
    filepath = tmp_path / "data.csv"
    filepath.write_text("a,b\n1,2")
    artifact_id = store.register(filepath, "Table", "table", "sess-1")
    content = store.read_content(artifact_id)
    assert content == b"a,b\n1,2"


def test_get_unknown_raises(store):
    with pytest.raises(ArtifactNotFoundError):
        store.get("missing")


def test_read_content_missing_file_raises(store, tmp_path: Path):
    filepath = tmp_path / "gone.html"
    filepath.write_text("x")
    artifact_id = store.register(filepath, "Chart", "figure", "sess-1")
    filepath.unlink()
    with pytest.raises(ArtifactGoneError):
        store.read_content(artifact_id)


def test_parse_visualize_tool_result(store, tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    filepath = output_dir / "price_distribution.html"
    filepath.write_text("<html></html>")
    content = f"Figure created: Price Distribution\nSaved to: output/price_distribution.html\n"
    artifact_id = store.register_from_tool_result(
        content=content,
        title="Price Distribution",
        artifact_type="figure",
        session_id="sess-1",
    )
    assert artifact_id is not None
    assert store.get(artifact_id).filepath == filepath
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_artifact_store.py -v`
Expected: FAIL

- [ ] **Step 3: Write implementation**

Create `api/services/artifact_store.py`:

```python
"""Register and serve visualization artifacts produced by the visualize tool."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Protocol

from api.exceptions import ArtifactGoneError, ArtifactNotFoundError

ArtifactType = Literal["figure", "table"]

# visualize.py returns "Saved to: output/<filename>"
_SAVED_TO_PATTERN = re.compile(r"Saved to:\s*(.+)", re.MULTILINE)


@dataclass
class Artifact:
    id: str
    filepath: Path
    title: str
    type: ArtifactType
    session_id: str
    created_at: datetime


class ArtifactStore(Protocol):
    def register(
        self,
        filepath: Path,
        title: str,
        artifact_type: ArtifactType,
        session_id: str,
    ) -> str: ...
    def register_from_tool_result(
        self,
        content: str,
        title: str,
        artifact_type: ArtifactType,
        session_id: str,
    ) -> str | None: ...
    def get(self, artifact_id: str) -> Artifact: ...
    def read_content(self, artifact_id: str) -> bytes: ...


class InMemoryArtifactStore:
    """In-memory artifact registry pointing to files on disk."""

    def __init__(self) -> None:
        self._artifacts: dict[str, Artifact] = {}

    def register(
        self,
        filepath: Path,
        title: str,
        artifact_type: ArtifactType,
        session_id: str,
    ) -> str:
        artifact_id = str(uuid.uuid4())
        self._artifacts[artifact_id] = Artifact(
            id=artifact_id,
            filepath=filepath,
            title=title,
            type=artifact_type,
            session_id=session_id,
            created_at=datetime.now(timezone.utc),
        )
        return artifact_id

    def register_from_tool_result(
        self,
        content: str,
        title: str,
        artifact_type: ArtifactType,
        session_id: str,
    ) -> str | None:
        match = _SAVED_TO_PATTERN.search(content)
        if not match:
            return None
        filepath = Path(match.group(1).strip())
        if not filepath.exists():
            return None
        return self.register(filepath, title, artifact_type, session_id)

    def get(self, artifact_id: str) -> Artifact:
        artifact = self._artifacts.get(artifact_id)
        if artifact is None:
            raise ArtifactNotFoundError(artifact_id)
        return artifact

    def read_content(self, artifact_id: str) -> bytes:
        artifact = self.get(artifact_id)
        if not artifact.filepath.exists():
            raise ArtifactGoneError(artifact_id)
        return artifact.filepath.read_bytes()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_artifact_store.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add api/services/artifact_store.py tests/unit/test_artifact_store.py
git commit -m "feat: add ArtifactStore with tool result parsing"
```

---

### Task 5: StreamTranslator

**Files:**
- Create: `api/streaming/translator.py`
- Create: `tests/unit/test_translator.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_translator.py`:

```python
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    TextPartDelta,
    ToolCallPart,
    ToolCallPartDelta,
    ToolReturnPart,
)

from api.streaming.events import SSEEventType
from api.streaming.translator import StreamTranslator
from api.services.artifact_store import InMemoryArtifactStore


def test_text_delta_emits_text_sse_event():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(
        PartDeltaEvent(index=0, delta=TextPartDelta(content_delta="Hello"))
    )
    assert events == [(SSEEventType.TEXT_DELTA, {"delta": "Hello"})]


def test_thinking_tag_emits_thinking_events():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(
        PartDeltaEvent(
            index=0,
            delta=TextPartDelta(content_delta="<thinking>plan</thinking>"),
        )
    )
    types = [e[0] for e in events]
    assert SSEEventType.THINKING_START in types
    assert SSEEventType.THINKING_DELTA in types
    assert SSEEventType.THINKING_END in types


def test_tool_call_event():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    part = ToolCallPart(tool_name="query_data", args={"sql": "SELECT 1"}, tool_call_id="tc1")
    events = translator.translate(FunctionToolCallEvent(part=part))
    assert events == [
        (
            SSEEventType.TOOL_CALL_START,
            {"tool_call_id": "tc1", "tool_name": "query_data", "args": {"sql": "SELECT 1"}},
        )
    ]


def test_tool_call_delta_event():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(
        PartDeltaEvent(
            index=0,
            delta=ToolCallPartDelta(tool_name_delta="", args_delta='{"sql":'),
            tool_call_id="tc1",
        )
    )
    assert events == [
        (SSEEventType.TOOL_CALL_DELTA, {"tool_call_id": "tc1", "args_delta": '{"sql":'})
    ]


def test_visualize_tool_result_emits_visualization(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    filepath = output_dir / "chart.html"
    filepath.write_text("<html></html>")
    store = InMemoryArtifactStore()
    translator = StreamTranslator(session_id="s1", artifact_store=store)
    content = "Figure created: Chart\nSaved to: output/chart.html\n"
    part = ToolReturnPart(tool_name="visualize", content=content, tool_call_id="tc2")
    events = translator.translate(
        FunctionToolResultEvent(result=part),
        tool_name="visualize",
        tool_args={"title": "Chart", "result_type": "figure"},
    )
    types = [e[0] for e in events]
    assert SSEEventType.TOOL_RESULT in types
    assert SSEEventType.VISUALIZATION in types
    viz = next(e for e in events if e[0] == SSEEventType.VISUALIZATION)
    assert viz[1]["title"] == "Chart"
    assert viz[1]["type"] == "figure"
    assert viz[1]["url"].startswith("/artifacts/")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_translator.py -v`
Expected: FAIL

- [ ] **Step 3: Write implementation**

Create `api/streaming/translator.py`:

```python
"""Translate PydanticAI stream events into our custom SSE event tuples."""

from __future__ import annotations

from typing import Any

from pydantic_ai import AgentStreamEvent
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
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
        if isinstance(event, PartDeltaEvent):
            return self._translate_part_delta(event)
        if isinstance(event, FunctionToolCallEvent):
            return self._translate_tool_call(event)
        if isinstance(event, FunctionToolResultEvent):
            return self._translate_tool_result(event, tool_name, tool_args)
        return []

    def flush(self) -> list[SSEEvent]:
        """Flush thinking parser buffer at end of stream."""
        return self._thinking_parser.flush()

    def _translate_part_delta(self, event: PartDeltaEvent) -> list[SSEEvent]:
        if isinstance(event.delta, TextPartDelta) and event.delta.content_delta:
            return self._thinking_parser.feed(event.delta.content_delta)
        if isinstance(event.delta, ToolCallPartDelta):
            return [
                (
                    SSEEventType.TOOL_CALL_DELTA,
                    {
                        "tool_call_id": event.tool_call_id,
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
        part = event.result
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_translator.py -v`
Expected: 5 passed (adjust imports if PydanticAI message constructors differ — inspect actual API)

- [ ] **Step 5: Commit**

```bash
git add api/streaming/translator.py tests/unit/test_translator.py
git commit -m "feat: add StreamTranslator for PydanticAI to SSE mapping"
```

---

### Task 6: Dataset Loader & Schemas

**Files:**
- Create: `api/services/dataset_loader.py`
- Create: `api/schemas.py`

- [ ] **Step 1: Extract dataset loader from main.py**

Create `api/services/dataset_loader.py`:

```python
"""Load CSV datasets from the data/ directory.

Logic extracted from main.py so both CLI and API share the same loading rules.
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd


def load_datasets(data_dir: str = "data") -> tuple[dict[str, pd.DataFrame], str]:
    """Load all CSV files from data_dir.

    Returns:
        Tuple of (datasets dict keyed by sanitized table name, info string for prompt).
    """
    data_path = Path(data_dir)
    if not data_path.exists():
        data_path.mkdir(parents=True, exist_ok=True)
        return {}, "No datasets available."

    datasets: dict[str, pd.DataFrame] = {}
    info_lines: list[str] = []

    for csv_file in sorted(data_path.glob("*.csv")):
        name = re.sub(r"[^a-zA-Z0-9_]", "_", csv_file.stem).strip("_").lower()
        df = pd.read_csv(csv_file)
        datasets[name] = df
        cols = ", ".join(df.columns.tolist())
        info_lines.append(
            f"- **{name}** ({df.shape[0]} rows, {df.shape[1]} columns)\n"
            f"  Columns: {cols}"
        )

    if not info_lines:
        return {}, "No datasets available. Add CSV files to the data/ directory."

    return datasets, "\n".join(info_lines)
```

- [ ] **Step 2: Create API schemas**

Create `api/schemas.py`:

```python
"""Pydantic models for REST request/response bodies."""

from __future__ import annotations

from pydantic import BaseModel, Field


class DatasetInfo(BaseModel):
    name: str
    rows: int
    columns: list[str]


class CreateSessionResponse(BaseModel):
    session_id: str
    datasets: list[DatasetInfo]


class SessionDetailResponse(BaseModel):
    session_id: str
    datasets: list[DatasetInfo]
    message_count: int
    is_streaming: bool


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
```

- [ ] **Step 3: Refactor main.py to use shared loader (optional but DRY)**

Modify `main.py` to import `load_datasets` from `api.services.dataset_loader` and remove the duplicated function.

- [ ] **Step 4: Commit**

```bash
git add api/services/dataset_loader.py api/schemas.py main.py
git commit -m "feat: add shared dataset loader and API schemas"
```

---

### Task 7: ChatService

**Files:**
- Create: `api/services/chat_service.py`
- Create: `tests/unit/test_chat_service.py`

- [ ] **Step 1: Write fake agent helper**

Create `tests/helpers/fake_agent.py`:

```python
"""Test doubles for PydanticAI agent streaming."""

from __future__ import annotations

from collections.abc import AsyncIterable, Callable
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock

from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    TextPartDelta,
    ToolCallPart,
    ToolReturnPart,
)


def make_fake_run_stream(events: list[Any], final_output: str = "Done."):
    """Return a mock agent whose run_stream yields predefined events."""

    @asynccontextmanager
    async def run_stream(*args, **kwargs):
        handler: Callable | None = kwargs.get("event_stream_handler")

        async def _emit():
            if handler is None:
                return
            ctx = MagicMock()

            async def event_gen():
                for event in events:
                    yield event

            await handler(ctx, event_gen())

        run = MagicMock()
        run.stream_text = AsyncMock(return_value=_async_iter([final_output]))

        emit_task = __import__("asyncio").create_task(_emit())
        try:
            yield run
        finally:
            await emit_task

    agent = MagicMock()
    agent.run_stream = run_stream
    agent.run = AsyncMock()
    return agent


async def _async_iter(items):
    for item in items:
        yield item
```

- [ ] **Step 2: Write failing chat service test**

Create `tests/unit/test_chat_service.py`:

```python
import pytest

from pydantic_ai.messages import PartDeltaEvent, TextPartDelta

from api.services.artifact_store import InMemoryArtifactStore
from api.services.chat_service import ChatService
from api.services.session_store import InMemorySessionStore
from api.streaming.events import SSEEventType
from tests.helpers.fake_agent import make_fake_run_stream


@pytest.mark.asyncio
async def test_stream_chat_yields_run_start_and_text_delta():
    session_store = InMemorySessionStore()
    artifact_store = InMemoryArtifactStore()
    datasets = {"cars": __import__("pandas").DataFrame({"price": [1]})}
    session = await session_store.create(datasets, "info")

    agent = make_fake_run_stream(
        [PartDeltaEvent(index=0, delta=TextPartDelta(content_delta="Hello"))]
    )
    service = ChatService(session_store=session_store, artifact_store=artifact_store)

    events = []
    async for sse in service.stream_chat(session.id, "Hi", agent=agent):
        events.append(sse)

    types = [e[0] for e in events]
    assert SSEEventType.RUN_START in types
    assert SSEEventType.TEXT_DELTA in types
    assert SSEEventType.DONE in types


@pytest.mark.asyncio
async def test_stream_chat_releases_lock_on_completion():
    session_store = InMemorySessionStore()
    artifact_store = InMemoryArtifactStore()
    session = await session_store.create({}, "info")
    agent = make_fake_run_stream([])

    service = ChatService(session_store=session_store, artifact_store=artifact_store)
    async for _ in service.stream_chat(session.id, "Hi", agent=agent):
        pass

    updated = await session_store.get(session.id)
    assert updated.is_streaming is False
```

- [ ] **Step 3: Write ChatService implementation**

Create `api/services/chat_service.py`:

```python
"""Orchestrate agent.run_stream and yield encoded SSE events."""

from __future__ import annotations

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
        session = await self._session_store.get(session_id)
        if session is None:
            raise SessionNotFoundError(session_id)

        run_id = str(uuid.uuid4())
        translator = StreamTranslator(session_id, self._artifact_store)
        outbound: asyncio.Queue[str | None] = __import__("asyncio").Queue()

        async def event_stream_handler(ctx, event_stream):
            async for event in event_stream:
                for sse_event in translator.translate(event):
                    await outbound.put(encode_event(*sse_event))
            for sse_event in translator.flush():
                await outbound.put(encode_event(*sse_event))

        yield encode_event(SSEEventType.RUN_START, {"run_id": run_id})

        try:
            async with agent.run_stream(
                message,
                deps=session.context,
                message_history=session.message_history or None,
                event_stream_handler=event_stream_handler,
            ) as run:
                # Consume stream_text to drive the run to completion.
                async for _delta in run.stream_text(delta=True):
                    pass
                session.message_history = run.all_messages()
        except Exception as exc:
            yield encode_event(SSEEventType.ERROR, {"message": str(exc)})
        finally:
            await self._session_store.release_stream(session_id)
            yield encode_event(SSEEventType.DONE, {"session_id": session_id})

        # Drain events emitted by handler during the run.
        # Note: implement with asyncio.Queue fed by handler; drain before done.
        # See implementation note below.
```

**Implementation note for engineer:** The `event_stream_handler` runs concurrently with `stream_text`. Use an `asyncio.Queue` — handler puts encoded SSE strings, main loop drains the queue after each `stream_text` delta and once more after run completes. Refactor `stream_chat` to:

```python
async def stream_chat(...) -> AsyncGenerator[str, None]:
    import asyncio
    queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue()
    translator = StreamTranslator(session_id, self._artifact_store)

    async def event_stream_handler(ctx, event_stream):
        async for event in event_stream:
            for sse_event in translator.translate(event):
                await queue.put(sse_event)
        for sse_event in translator.flush():
            await queue.put(sse_event)

    yield encode_event(SSEEventType.RUN_START, {"run_id": run_id})

    async def run_agent():
        try:
            async with agent.run_stream(..., event_stream_handler=event_stream_handler) as run:
                async for _ in run.stream_text(delta=True):
                    while not queue.empty():
                        evt = queue.get_nowait()
                        yield encode_event(*evt)  # use shared drain helper
                session.message_history = run.all_messages()
        except Exception as exc:
            yield encode_event(SSEEventType.ERROR, {"message": str(exc)})

    # Use asyncio.Task + async generator pattern to interleave queue drain with run.
    # Final pattern: create task for run, loop `while not task.done() or not queue.empty()` draining queue.
```

Provide the final working pattern in implementation (agent worker must not block SSE yield):

```python
import asyncio

async def stream_chat(self, session_id, message, agent):
    session = await self._session_store.get(session_id)
    if session is None:
        raise SessionNotFoundError(session_id)

    run_id = str(uuid.uuid4())
    translator = StreamTranslator(session_id, self._artifact_store)
    queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue()

    async def event_stream_handler(ctx, event_stream):
        async for event in event_stream:
            for sse_event in translator.translate(event):
                await queue.put(sse_event)
        for sse_event in translator.flush():
            await queue.put(sse_event)

    yield encode_event(SSEEventType.RUN_START, {"run_id": run_id})

    async def _run():
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
        await task  # propagate exceptions
    finally:
        await self._session_store.release_stream(session_id)
        yield encode_event(SSEEventType.DONE, {"session_id": session_id})
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/unit/test_chat_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/services/chat_service.py tests/unit/test_chat_service.py tests/helpers/fake_agent.py
git commit -m "feat: add ChatService SSE streaming orchestration"
```

---

### Task 8: FastAPI App, Dependencies & Routes

**Files:**
- Create: `api/dependencies.py`
- Create: `api/routes/__init__.py`
- Create: `api/routes/sessions.py`
- Create: `api/routes/chat.py`
- Create: `api/routes/artifacts.py`
- Create: `api/main.py`
- Create: `tests/conftest.py` (extend)
- Create: `tests/integration/test_sessions_api.py`
- Create: `tests/integration/test_artifacts_api.py`

- [ ] **Step 1: Write failing sessions API test**

Create `tests/integration/test_sessions_api.py`:

```python
from fastapi.testclient import TestClient


def test_create_session_returns_datasets(client: TestClient):
    response = client.post("/sessions")
    assert response.status_code == 200
    body = response.json()
    assert "session_id" in body
    assert isinstance(body["datasets"], list)
    assert len(body["datasets"]) > 0


def test_get_session(client: TestClient):
    created = client.post("/sessions").json()
    response = client.get(f"/sessions/{created['session_id']}")
    assert response.status_code == 200
    assert response.json()["message_count"] == 0


def test_delete_session(client: TestClient):
    created = client.post("/sessions").json()
    response = client.delete(f"/sessions/{created['session_id']}")
    assert response.status_code == 204
    assert client.get(f"/sessions/{created['session_id']}").status_code == 404


def test_health(client: TestClient):
    assert client.get("/health").json() == {"status": "ok"}
```

- [ ] **Step 2: Extend conftest with TestClient fixture**

Update `tests/conftest.py`:

```python
import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_artifact_store, get_session_store
from api.main import create_app
from api.services.artifact_store import InMemoryArtifactStore
from api.services.session_store import InMemorySessionStore


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
```

- [ ] **Step 3: Implement dependencies, routes, main**

Create `api/dependencies.py`:

```python
"""FastAPI dependency injection — swap stores here for tests."""

from api.services.artifact_store import ArtifactStore, InMemoryArtifactStore
from api.services.session_store import InMemorySessionStore, SessionStore

_session_store = InMemorySessionStore()
_artifact_store = InMemoryArtifactStore()


def get_session_store() -> SessionStore:
    return _session_store


def get_artifact_store() -> ArtifactStore:
    return _artifact_store
```

Create `api/routes/sessions.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Response, status

from api.dependencies import get_session_store
from api.exceptions import SessionNotFoundError
from api.schemas import CreateSessionResponse, DatasetInfo, SessionDetailResponse
from api.services.dataset_loader import load_datasets
from api.services.session_store import SessionStore

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=CreateSessionResponse)
async def create_session(store: SessionStore = Depends(get_session_store)):
    datasets, _info = load_datasets()
    session = await store.create(datasets, _info)
    return CreateSessionResponse(
        session_id=session.id,
        datasets=[
            DatasetInfo(name=name, rows=len(df), columns=list(df.columns))
            for name, df in datasets.items()
        ],
    )


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: str, store: SessionStore = Depends(get_session_store)):
    session = await store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionDetailResponse(
        session_id=session.id,
        datasets=[
            DatasetInfo(name=n, rows=len(df), columns=list(df.columns))
            for n, df in session.context.datasets.items()
        ],
        message_count=len(session.message_history),
        is_streaming=session.is_streaming,
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str, store: SessionStore = Depends(get_session_store)):
    if not await store.delete(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

Create `api/routes/chat.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from agent.agent import create_agent
from api.dependencies import get_artifact_store, get_session_store
from api.exceptions import SessionNotFoundError, StreamBusyError
from api.schemas import ChatRequest
from api.services.chat_service import ChatService
from api.services.session_store import SessionStore
from api.services.artifact_store import ArtifactStore

router = APIRouter(tags=["chat"])


@router.post("/sessions/{session_id}/chat")
async def chat(
    session_id: str,
    body: ChatRequest,
    session_store: SessionStore = Depends(get_session_store),
    artifact_store: ArtifactStore = Depends(get_artifact_store),
):
    try:
        session = await session_store.acquire_stream(session_id)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except StreamBusyError:
        raise HTTPException(status_code=409, detail="Stream already active")

    agent = create_agent(session.context.dataset_info)
    service = ChatService(session_store, artifact_store)

    async def event_generator():
        async for chunk in service.stream_chat(session_id, body.message, agent):
            yield chunk

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

Create `api/routes/artifacts.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Response

from api.dependencies import get_artifact_store
from api.exceptions import ArtifactGoneError, ArtifactNotFoundError
from api.services.artifact_store import ArtifactStore

router = APIRouter(prefix="/artifacts", tags=["artifacts"])

_CONTENT_TYPES = {"figure": "text/html", "table": "text/csv"}


@router.get("/{artifact_id}")
async def get_artifact(
    artifact_id: str,
    store: ArtifactStore = Depends(get_artifact_store),
):
    try:
        artifact = store.get(artifact_id)
        content = store.read_content(artifact_id)
    except ArtifactNotFoundError:
        raise HTTPException(status_code=404, detail="Artifact not found")
    except ArtifactGoneError:
        raise HTTPException(status_code=410, detail="Artifact file no longer available")

    return Response(
        content=content,
        media_type=_CONTENT_TYPES.get(artifact.type, "application/octet-stream"),
    )
```

Create `api/main.py`:

```python
"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import artifacts, chat, sessions


def create_app() -> FastAPI:
    app = FastAPI(
        title="Data Analysis Agent API",
        description="SSE-streaming API for the PydanticAI data analysis agent.",
        version="0.1.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Restrict in production
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(sessions.router)
    app.include_router(chat.router)
    app.include_router(artifacts.router)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
```

Create `api/routes/__init__.py` (empty).

- [ ] **Step 4: Run integration tests**

Run: `pytest tests/integration/test_sessions_api.py -v`
Expected: PASS

- [ ] **Step 5: Write artifacts integration test**

Create `tests/integration/test_artifacts_api.py`:

```python
from fastapi.testclient import TestClient


def test_get_artifact_returns_html(client: TestClient, artifact_store, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    filepath = tmp_path / "chart.html"
    filepath.write_text("<html>plot</html>")
    artifact_id = artifact_store.register(filepath, "Chart", "figure", "s1")

    response = client.get(f"/artifacts/{artifact_id}")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert b"plot" in response.content


def test_get_unknown_artifact_404(client: TestClient):
    assert client.get("/artifacts/missing").status_code == 404
```

Run: `pytest tests/integration/test_artifacts_api.py -v`

- [ ] **Step 6: Commit**

```bash
git add api/ tests/integration/
git commit -m "feat: add FastAPI routes for sessions, chat SSE, and artifacts"
```

---

### Task 9: Chat API Integration Test

**Files:**
- Create: `tests/integration/test_chat_api.py`
- Modify: `api/routes/chat.py` (inject agent factory for testing)

- [ ] **Step 1: Add agent factory dependency for testability**

Modify `api/dependencies.py` to add:

```python
from agent.agent import create_agent

def get_agent_factory():
    return create_agent
```

Modify `api/routes/chat.py` to accept `agent_factory=Depends(get_agent_factory)`.

- [ ] **Step 2: Write chat integration test**

Create `tests/integration/test_chat_api.py`:

```python
from pydantic_ai.messages import PartDeltaEvent, TextPartDelta

from tests.helpers.fake_agent import make_fake_run_stream
from tests.helpers.sse_parser import parse_sse


def test_chat_stream_returns_sse_events(client, session_store, monkeypatch):
    created = client.post("/sessions").json()
    session_id = created["session_id"]

    fake_agent = make_fake_run_stream(
        [
            PartDeltaEvent(index=0, delta=TextPartDelta(content_delta="<thinking>plan</thinking>")),
            PartDeltaEvent(index=0, delta=TextPartDelta(content_delta="Answer.")),
        ]
    )
    monkeypatch.setattr("api.routes.chat.create_agent", lambda info: fake_agent)

    with client.stream(
        "POST",
        f"/sessions/{session_id}/chat",
        json={"message": "Hello"},
    ) as response:
        assert response.status_code == 200
        raw = "".join(response.iter_text())
        events = parse_sse(raw)
        types = [t for t, _ in events]
        assert "run_start" in types
        assert "thinking_delta" in types
        assert "text_delta" in types
        assert "done" in types


def test_chat_returns_409_when_busy(client, monkeypatch):
    created = client.post("/sessions").json()
    session_id = created["session_id"]

    # Simulate busy session
    import asyncio
    session = asyncio.get_event_loop().run_until_complete(session_store.get(session_id))
    session.is_streaming = True

    response = client.post(f"/sessions/{session_id}/chat", json={"message": "Hi"})
    assert response.status_code == 409
```

- [ ] **Step 3: Run tests and fix issues**

Run: `pytest tests/integration/test_chat_api.py -v`

- [ ] **Step 4: Commit**

```bash
git add tests/integration/test_chat_api.py api/dependencies.py api/routes/chat.py
git commit -m "test: add chat SSE integration tests with mocked agent"
```

---

### Task 10: Docker & Final Verification

**Files:**
- Create: `Dockerfile.api`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile.api**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Update docker-compose.yml**

Add `api` service:

```yaml
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports:
      - "8000:8000"
    env_file:
      - .env
    volumes:
      - ./data:/app/data
      - ./output:/app/output
```

- [ ] **Step 3: Run full test suite**

Run: `pytest tests/ -v`
Expected: all tests PASS

- [ ] **Step 4: Manual smoke test (optional, requires API key)**

```bash
uvicorn api.main:app --reload --port 8000 &
SESSION=$(curl -s -X POST http://localhost:8000/sessions | python -c "import sys,json; print(json.load(sys.stdin)['session_id'])")
curl -N -X POST "http://localhost:8000/sessions/$SESSION/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "How many rows in carpriceprediction?"}'
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.api docker-compose.yml
git commit -m "chore: add Docker setup for API service"
```

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|------------------|------|
| POST /sessions | Task 8 |
| GET/DELETE /sessions/{id} | Task 8 |
| POST /sessions/{id}/chat SSE | Tasks 7, 8, 9 |
| GET /artifacts/{id} | Tasks 4, 8 |
| GET /health | Task 8 |
| Custom SSE events | Tasks 1, 5 |
| ThinkingParser | Task 2 |
| 409 stream lock | Tasks 3, 9 |
| Artifact hybrid delivery | Tasks 4, 5 |
| CORS | Task 8 |
| TDD order | All tasks |
| Docker | Task 10 |
| Code comments on why | All implementation tasks |
| No frontend | Out of scope |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-14-fastapi-sse-api.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
