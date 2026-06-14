# Streaming Thinking + Status Sentences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent's pre-tool reasoning actually stream to the browser, and add short human-readable status sentences ("Querying the dataset…") so the chat feels like the Claude chat UI.

**Architecture:** Two changes, both confined to `api/` and `web/` — the `agent/` folder is untouched.
1. **Surface intermediate-turn text (the bug fix).** PydanticAI delivers a turn's text two ways: text from turns that end in a *tool call* flows through `event_stream_handler`; text from the *final* turn flows through `run.stream_text()`. The agent's `<thinking>` blocks (required by `agent/prompt.py`) happen on the tool-calling turns, so they arrive via the handler — but `api/streaming/translator.py:58-59` currently **drops** that handler text. We route it through the existing `ThinkingParser` instead. The final answer still comes from `run.stream_text()`, so there is no duplication (the handler breaks at `FinalResultEvent` before the final answer's deltas, confirmed in `pydantic_ai/agent/abstract.py:793-811`).
2. **Status sentences.** Add a new `status` SSE event emitted in the API layer when a tool call starts, mapped from the tool name to a friendly sentence. The frontend appends these to a list and renders them as a subtle context feed.

**Tech Stack:** Python 3.13 / FastAPI / PydanticAI 1.107 / pytest (backend); React 19 / TypeScript / Vite (frontend, no test runner — verified via `tsc --noEmit` + manual run).

---

## File Structure

**Backend (modified):**
- `api/streaming/events.py` — add `STATUS` event type.
- `api/streaming/translator.py` — feed handler text into the thinking parser; emit `STATUS` on tool calls.
- `tests/unit/test_translator.py` — update two existing tests, add new ones.
- `tests/unit/test_chat_service.py` — add an end-to-end no-duplication test.

**Frontend (modified):**
- `web/src/types/transcript.ts` — add `statuses: string[]` to the `chat_run` entry.
- `web/src/lib/transcriptReducer.ts` — handle the `status` event.
- `web/src/routes/index.tsx` — initialize `statuses: []`.
- `web/src/components/ChatTranscript.tsx` — render the status feed.

**Untouched:** everything under `agent/`.

**Note on the `<thinking>`-tag approach:** We deliberately keep the prompt-driven `<thinking>` tags (so `agent/` stays untouched). This plan only makes those tags reach the UI. Switching to Claude native extended thinking is a separate, optional upgrade that would require editing `agent/`.

**CORRECTION (added after live verification — Task 6):** The plan above assumed `run_stream` + `stream_text` would not double-feed text to the parser. Live testing disproved this: for a text/thinking response, `run_stream` emits the *leading* text deltas through the event handler before breaking at `FinalResultEvent`, then `stream_text()` re-emits the *full* text — feeding the parser twice (duplicated thinking + a leaked literal `<thinking>` tag). The fix (Task 6 below) switches `chat_service` from `run_stream` + `stream_text` to `agent.run` + `event_stream_handler`, which streams every turn's full text through the handler exactly once. This is also PydanticAI's recommended API (`run_stream` is deprecated). Task 1's translator change (route handler text through the parser) remains correct and necessary; only `chat_service`'s producer changes.

---

## Task 1: Surface intermediate-turn text through the thinking parser (API only)

This is the core bug fix. The thinking UI on the frontend already works (`transcriptReducer.ts` handles `thinking_delta`, `ChatTranscript.tsx` renders it) — it just never receives events. No frontend change in this task.

**Files:**
- Modify: `api/streaming/translator.py`
- Test: `tests/unit/test_translator.py`

- [ ] **Step 1: Update the existing "ignored" test to assert the new behavior**

The test `test_text_part_delta_from_event_stream_is_ignored` encodes the OLD buggy behavior. Replace it. Open `tests/unit/test_translator.py` and replace this block (lines 22-27):

```python
def test_text_part_delta_from_event_stream_is_ignored():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(
        PartDeltaEvent(index=0, delta=TextPartDelta(content_delta="Hello"))
    )
    assert events == []
```

with:

```python
def test_text_part_delta_from_event_stream_is_surfaced():
    """Text from tool-calling turns (where <thinking> lives) must reach the client."""
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(
        PartDeltaEvent(index=0, delta=TextPartDelta(content_delta="Hello"))
    )
    assert events == [(SSEEventType.TEXT_DELTA, {"delta": "Hello"})]


def test_thinking_in_event_stream_text_emits_thinking_events():
    """A <thinking> block arriving via the event handler streams as thinking."""
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(
        PartDeltaEvent(
            index=0, delta=TextPartDelta(content_delta="<thinking>plan SQL</thinking>")
        )
    )
    types = [e[0] for e in events]
    assert SSEEventType.THINKING_START in types
    assert (SSEEventType.THINKING_DELTA, {"delta": "plan SQL"}) in events
    assert SSEEventType.THINKING_END in types


def test_part_start_text_is_surfaced():
    """Some providers carry initial text on PartStartEvent; it must not be dropped."""
    from pydantic_ai.messages import PartStartEvent, TextPart

    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(PartStartEvent(index=0, part=TextPart(content="hi")))
    assert events == [(SSEEventType.TEXT_DELTA, {"delta": "hi"})]


def test_empty_part_start_text_emits_nothing():
    from pydantic_ai.messages import PartStartEvent, TextPart

    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(PartStartEvent(index=0, part=TextPart(content="")))
    assert events == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest tests/unit/test_translator.py -v`
Expected: FAIL — `test_text_part_delta_from_event_stream_is_surfaced` fails (returns `[]`), and the `PartStartEvent` tests fail (translator ignores `PartStartEvent`, returns `[]`).

- [ ] **Step 3: Add imports for `PartStartEvent` and `TextPart`**

In `api/streaming/translator.py`, replace the import block (lines 8-14):

```python
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    TextPartDelta,
    ToolCallPartDelta,
)
```

with:

```python
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPartDelta,
)
```

- [ ] **Step 4: Handle `PartStartEvent` and feed text deltas into the parser**

In `api/streaming/translator.py`, replace the `translate` method's body dispatch (lines 39-45):

```python
        if isinstance(event, PartDeltaEvent):
            return self._translate_part_delta(event)
        if isinstance(event, FunctionToolCallEvent):
            return self._translate_tool_call(event)
        if isinstance(event, FunctionToolResultEvent):
            return self._translate_tool_result(event, tool_name, tool_args)
        return []
```

with:

```python
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
```

- [ ] **Step 5: Route `TextPartDelta` from the handler through the parser**

In `api/streaming/translator.py`, replace the `_translate_part_delta` text branch (lines 56-59):

```python
        # Text deltas are read from run.stream_text(); event_stream only carries
        # tool-call deltas on follow-up turns when the model replies without tools.
        if isinstance(event.delta, TextPartDelta):
            return []
```

with:

```python
        # Text from tool-calling turns (the agent's <thinking> blocks) arrives
        # here; the final answer's text comes via run.stream_text(). Feed both
        # through the same parser. The handler breaks at FinalResultEvent before
        # the final answer's deltas, so there is no duplication.
        if isinstance(event.delta, TextPartDelta):
            return self._thinking_parser.feed(event.delta.content_delta)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `.venv/bin/pytest tests/unit/test_translator.py -v`
Expected: PASS (all tests, including the unchanged `test_thinking_tag_emits_thinking_events` and `test_visualize_tool_result_emits_visualization`).

- [ ] **Step 7: Run the full unit suite to check for regressions**

Run: `.venv/bin/pytest tests/unit -v`
Expected: PASS, except possibly `tests/unit/test_chat_service.py` (unaffected here) — `test_tool_call_event` in the translator file still passes because Task 2 has not changed it yet.

- [ ] **Step 8: Commit**

```bash
git add api/streaming/translator.py tests/unit/test_translator.py
git commit -m "fix(api): stream pre-tool thinking text instead of dropping it"
```

---

## Task 2: Emit status sentences on tool calls (API only)

**Files:**
- Modify: `api/streaming/events.py`
- Modify: `api/streaming/translator.py`
- Test: `tests/unit/test_translator.py`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/test_translator.py`, replace the existing `test_tool_call_event` (lines 39-48):

```python
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
```

with:

```python
def test_tool_call_event_emits_status_then_tool_call_start():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    part = ToolCallPart(tool_name="query_data", args={"sql": "SELECT 1"}, tool_call_id="tc1")
    events = translator.translate(FunctionToolCallEvent(part=part))
    assert events == [
        (SSEEventType.STATUS, {"text": "Querying the dataset…"}),
        (
            SSEEventType.TOOL_CALL_START,
            {"tool_call_id": "tc1", "tool_name": "query_data", "args": {"sql": "SELECT 1"}},
        ),
    ]


def test_visualize_tool_call_status():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    part = ToolCallPart(tool_name="visualize", args={"title": "Chart"}, tool_call_id="tc1")
    events = translator.translate(FunctionToolCallEvent(part=part))
    assert events[0] == (SSEEventType.STATUS, {"text": "Creating the visualization…"})


def test_unknown_tool_call_status_fallback():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    part = ToolCallPart(tool_name="frobnicate", args={}, tool_call_id="tc1")
    events = translator.translate(FunctionToolCallEvent(part=part))
    assert events[0] == (SSEEventType.STATUS, {"text": "Running frobnicate…"})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest tests/unit/test_translator.py -k "status or tool_call_event" -v`
Expected: FAIL — `SSEEventType.STATUS` does not exist (AttributeError) / status events are not emitted.

- [ ] **Step 3: Add the `STATUS` event type**

In `api/streaming/events.py`, add the member after `RUN_START` (line 9):

```python
    RUN_START = "run_start"
    STATUS = "status"
```

- [ ] **Step 4: Add the tool→sentence map and emit STATUS in `_translate_tool_call`**

In `api/streaming/translator.py`, add this class attribute right after the `class StreamTranslator:` docstring (after line 24):

```python
    # Friendly status sentences shown in the UI while a tool runs.
    _TOOL_STATUS = {
        "query_data": "Querying the dataset…",
        "visualize": "Creating the visualization…",
    }
```

Then replace `_translate_tool_call` (lines 72-85) with:

```python
    def _translate_tool_call(self, event: FunctionToolCallEvent) -> list[SSEEvent]:
        part = event.part
        args = part.args if isinstance(part.args, dict) else {}
        self._pending_tool_args[part.tool_call_id] = args
        status = self._TOOL_STATUS.get(part.tool_name, f"Running {part.tool_name}…")
        return [
            (SSEEventType.STATUS, {"text": status}),
            (
                SSEEventType.TOOL_CALL_START,
                {
                    "tool_call_id": part.tool_call_id,
                    "tool_name": part.tool_name,
                    "args": args,
                },
            ),
        ]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/pytest tests/unit/test_translator.py -v`
Expected: PASS (all translator tests).

- [ ] **Step 6: Commit**

```bash
git add api/streaming/events.py api/streaming/translator.py tests/unit/test_translator.py
git commit -m "feat(api): emit status sentences when a tool call starts"
```

---

## Task 3: End-to-end no-duplication test (API only)

Prove that intermediate thinking (via the handler) and the final answer (via `stream_text`) both appear, the final answer appears exactly once, and status events flow — using the existing `make_fake_run_stream` helper, which already models the two channels (`events` → handler, `stream_text_chunks` → final).

**Files:**
- Test: `tests/unit/test_chat_service.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/test_chat_service.py`:

```python
@pytest.mark.asyncio
async def test_stream_chat_surfaces_thinking_status_and_answer_once():
    from pydantic_ai.messages import (
        FunctionToolCallEvent,
        FunctionToolResultEvent,
        PartDeltaEvent,
        TextPartDelta,
        ToolCallPart,
        ToolReturnPart,
    )

    session_store = InMemorySessionStore()
    artifact_store = InMemoryArtifactStore()
    session = await session_store.create({}, "info")
    await session_store.acquire_stream(session.id)

    # Events that PydanticAI delivers through the handler on a tool-calling turn.
    handler_events = [
        PartDeltaEvent(
            index=0, delta=TextPartDelta(content_delta="<thinking>plan SQL</thinking>")
        ),
        FunctionToolCallEvent(
            part=ToolCallPart(
                tool_name="query_data", args={"sql": "SELECT 1"}, tool_call_id="tc1"
            )
        ),
        FunctionToolResultEvent(
            part=ToolReturnPart(tool_name="query_data", content="ok", tool_call_id="tc1")
        ),
    ]
    agent = make_fake_run_stream(
        handler_events, stream_text_chunks=["Here is the answer."]
    )
    service = ChatService(session_store=session_store, artifact_store=artifact_store)

    raw = ""
    async for sse in service.stream_chat(session.id, "Hi", agent=agent):
        raw += sse

    events = parse_sse(raw)
    types = [t for t, _ in events]
    thinking = "".join(
        d["delta"] for t, d in events if t == SSEEventType.THINKING_DELTA
    )
    text = "".join(d["delta"] for t, d in events if t == SSEEventType.TEXT_DELTA)
    statuses = [d["text"] for t, d in events if t == SSEEventType.STATUS]

    assert "plan SQL" in thinking
    assert "Querying the dataset…" in statuses
    assert SSEEventType.TOOL_CALL_START in types
    # The final answer appears exactly once (no handler/stream_text duplication).
    assert text.count("Here is the answer.") == 1
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `.venv/bin/pytest tests/unit/test_chat_service.py -v`
Expected: PASS. (After Tasks 1–2 the behavior is already implemented, so this test should pass immediately — it is a regression guard. If it fails on duplication, re-check Task 1 Step 5.)

- [ ] **Step 3: Run the entire backend suite**

Run: `.venv/bin/pytest -v`
Expected: PASS (unit + integration).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/test_chat_service.py
git commit -m "test(api): guard thinking/status/answer streaming end-to-end"
```

---

## Task 4: Render the status feed on the frontend (web only)

The frontend has no test runner, so verification is `tsc --noEmit` plus a manual run (Task 5). Thinking rendering already exists and needs no change — only status wiring is new.

**Files:**
- Modify: `web/src/types/transcript.ts`
- Modify: `web/src/lib/transcriptReducer.ts`
- Modify: `web/src/routes/index.tsx`
- Modify: `web/src/components/ChatTranscript.tsx`

- [ ] **Step 1: Add `statuses` to the `chat_run` entry type**

In `web/src/types/transcript.ts`, in the `chat_run` variant (lines 12-21), add the `statuses` field:

```typescript
  | {
      id: string;
      transcriptType: "chat_run";
      toolCalls: ToolCall[];
      visualizations: Visualization[];
      runId?: string;
      thinking: string;
      text: string;
      statuses: string[];
      status: "streaming" | "done" | "error";
    }
```

- [ ] **Step 2: Handle the `status` event in the reducer**

In `web/src/lib/transcriptReducer.ts`, add a case in the `switch` after the `text_delta` case (after line 32):

```typescript
    case "status":
      run.statuses = [...run.statuses, (event.data.text as string) ?? ""];
      break;
```

- [ ] **Step 3: Initialize `statuses` when the run entry is created**

In `web/src/routes/index.tsx`, in the `chat_run` object created in `handleSend` (lines 69-77), add `statuses: []`:

```typescript
      {
        id: runEntryId,
        transcriptType: "chat_run",
        thinking: "",
        text: "",
        statuses: [],
        toolCalls: [],
        visualizations: [],
        status: "streaming",
      },
```

- [ ] **Step 4: Render the status feed in `ChatRun`**

In `web/src/components/ChatTranscript.tsx`, inside the `ChatRun` component, add the status feed right after the opening `<div>` and before the `runId` line (after line 19, `<div>`):

```tsx
      {entry.statuses.length > 0 && (
        <div className="my-1 text-sm text-gray-500">
          {entry.statuses.map((s, i) => (
            <div key={i} className={i === entry.statuses.length - 1 && entry.status === "streaming" ? "font-medium" : ""}>
              • {s}
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 5: Type-check the frontend**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. (If `tsc` is not installed, run `npm install` first — `typescript` is in `devDependencies`.)

- [ ] **Step 6: Commit**

```bash
git add web/src/types/transcript.ts web/src/lib/transcriptReducer.ts web/src/routes/index.tsx web/src/components/ChatTranscript.tsx
git commit -m "feat(web): render streaming status sentences in the transcript"
```

---

## Task 5: Manual end-to-end verification

No code change — confirm the real experience. Requires an `ANTHROPIC_API_KEY` in the environment (the agent defaults to `anthropic:claude-haiku-4-5-20251001`).

- [ ] **Step 1: Start the API**

Run (from repo root): `.venv/bin/python main.py` (or the project's documented start command for the FastAPI app).
Expected: server starts, no import errors.

- [ ] **Step 2: Start the web app**

Run: `cd web && npm run dev`
Expected: Vite dev server URL printed.

- [ ] **Step 3: Send a message and observe**

In the browser, ask a question that requires a query + chart, e.g. "Show me the average price by category as a bar chart."
Expected, during streaming:
- A "thinking" block fills in with the model's reasoning **before** the first tool call (this is the bug fix — previously empty).
- Status lines appear in order: "Querying the dataset…", then "Creating the visualization…".
- Tool calls and the visualization link render as before.
- The final answer text appears once, not duplicated.

- [ ] **Step 4: Remove the debug `console.log` left in the renderer (optional cleanup)**

`web/src/components/ChatTranscript.tsx` has `console.log` calls at lines 53 and 81 (pre-existing). If desired, remove them and commit:

```bash
git add web/src/components/ChatTranscript.tsx
git commit -m "chore(web): drop debug console.log from transcript"
```

---

## Self-Review

**Spec coverage:**
- #1 "fix dropped thinking, API only" → Tasks 1 & 3 (translator routes handler text through the parser; integration test proves no duplication). No `agent/` change. ✓
- #3 "status sentences, API + frontend" → Tasks 2 (API event + emission) & 4 (frontend rendering). No `agent/` change. ✓
- "keep `agent/` untouched" → no task touches `agent/`. ✓

**Placeholder scan:** No TBD/“handle edge cases”/“similar to” — all code is concrete. Frontend tasks use `tsc --noEmit` + manual run because the repo has no JS test runner (stated explicitly), not as a hand-wave. ✓

**Type consistency:**
- `STATUS = "status"` (events.py) matches reducer `case "status"` and the `{"text": ...}` payload used in translator, chat_service test, and reducer (`event.data.text`). ✓
- `statuses: string[]` added to the type, initialized in `index.tsx`, appended in the reducer, read in `ChatTranscript.tsx`. ✓
- `ThinkingParser.feed` is the existing method name, used unchanged. ✓
- `TextPartDelta.content_delta` matches existing usage in `tests/unit/test_translator.py`. ✓
