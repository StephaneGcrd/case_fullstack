from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
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
