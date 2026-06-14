from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    ToolCallPartDelta,
    ToolReturnPart,
)

from api.services.artifact_store import InMemoryArtifactStore
from api.streaming.events import SSEEventType
from api.streaming.translator import StreamTranslator


def test_text_delta_emits_text_sse_event():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.feed_text("Hello")
    assert events == [(SSEEventType.TEXT_DELTA, {"delta": "Hello"})]


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
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(PartStartEvent(index=0, part=TextPart(content="hi")))
    assert events == [(SSEEventType.TEXT_DELTA, {"delta": "hi"})]


def test_empty_part_start_text_emits_nothing():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(PartStartEvent(index=0, part=TextPart(content="")))
    assert events == []


def test_part_start_thinking_emits_thinking_events():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(
        PartStartEvent(index=0, part=TextPart(content="<thinking>plan</thinking>"))
    )
    types = [e[0] for e in events]
    assert SSEEventType.THINKING_START in types
    assert (SSEEventType.THINKING_DELTA, {"delta": "plan"}) in events
    assert SSEEventType.THINKING_END in types


def test_thinking_tag_emits_thinking_events():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.feed_text("<thinking>plan</thinking>")
    types = [e[0] for e in events]
    assert SSEEventType.THINKING_START in types
    assert SSEEventType.THINKING_DELTA in types
    assert SSEEventType.THINKING_END in types


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
    assert events == [
        (SSEEventType.STATUS, {"text": "Creating the visualization…"}),
        (
            SSEEventType.TOOL_CALL_START,
            {"tool_call_id": "tc1", "tool_name": "visualize", "args": {"title": "Chart"}},
        ),
    ]


def test_unknown_tool_call_status_fallback():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    part = ToolCallPart(tool_name="frobnicate", args={}, tool_call_id="tc1")
    events = translator.translate(FunctionToolCallEvent(part=part))
    assert events == [
        (SSEEventType.STATUS, {"text": "Running frobnicate…"}),
        (
            SSEEventType.TOOL_CALL_START,
            {"tool_call_id": "tc1", "tool_name": "frobnicate", "args": {}},
        ),
    ]


def test_tool_call_delta_event():
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    events = translator.translate(
        PartDeltaEvent(
            index=0,
            delta=ToolCallPartDelta(
                args_delta='{"sql":',
                tool_name_delta="",
                tool_call_id="tc1",
            ),
        )
    )
    assert events == [
        (SSEEventType.TOOL_CALL_DELTA, {"tool_call_id": "tc1", "args_delta": '{"sql":'})
    ]


def test_tool_call_args_parsed_from_json_string():
    """Anthropic delivers args as a JSON string; it must be surfaced as a dict."""
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    part = ToolCallPart(
        tool_name="query_data",
        args='{"sql": "SELECT 1", "description": "demo"}',
        tool_call_id="tc1",
    )
    events = translator.translate(FunctionToolCallEvent(part=part))
    assert events == [
        (SSEEventType.STATUS, {"text": "Querying the dataset…"}),
        (
            SSEEventType.TOOL_CALL_START,
            {
                "tool_call_id": "tc1",
                "tool_name": "query_data",
                "args": {"sql": "SELECT 1", "description": "demo"},
            },
        ),
    ]


def test_visualize_args_from_json_string_set_title():
    """A JSON-string args payload must still drive the visualization title."""
    translator = StreamTranslator(session_id="s1", artifact_store=InMemoryArtifactStore())
    call = ToolCallPart(
        tool_name="visualize",
        args='{"title": "My Chart", "result_type": "figure"}',
        tool_call_id="tc9",
    )
    translator.translate(FunctionToolCallEvent(part=call))
    # The stored args (used to enrich the visualize result) must be the parsed dict.
    assert translator._pending_tool_args["tc9"] == {
        "title": "My Chart",
        "result_type": "figure",
    }


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
        FunctionToolResultEvent(part=part),
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
