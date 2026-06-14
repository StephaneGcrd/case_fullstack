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
    # Partial open tag stays in carry until flush at end of stream.
    events = parser.feed("hello<thin")
    assert events == [(SSEEventType.TEXT_DELTA, {"delta": "hello"})]
    events = parser.flush()
    assert events == [(SSEEventType.TEXT_DELTA, {"delta": "<thin"})]
