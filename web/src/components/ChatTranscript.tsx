/**
 * Scrollable chat transcript: maps {@link TranscriptEntry} items to layout and
 * segment views. User messages align right; assistant runs and errors align left;
 * session lifecycle rows are centered system-style lines.
 */
import { useLayoutEffect, useRef } from "react";
import type { ChatRunEntry, TranscriptEntry } from "../types/transcript";
import { RunSegmentView } from "./segment-views/RunSegmentView";
import { SessionResponseTable } from "./SessionResponseTable";

type ChatTranscriptProps = {
  entries: TranscriptEntry[];
};

/** Inline error row shown when the stream or API reports a failure. */
function ErrorBlock({ message }: { message: string }) {
  return <div className="error-block">Error: {message}</div>;
}

/**
 * One assistant turn: a vertical stack of {@link RunSegment} blocks streamed
 * in SSE arrival order (status, thinking, text, tools, visualizations).
 */
function ChatRun({
  entry,
}: {
  entry: ChatRunEntry;
}) {
  return (
    <div className="flex w-full max-w-full flex-col items-start gap-3 overflow-hidden">
      {entry.segments.map((segment, index) => (
        <RunSegmentView
          // Stable keys: tool calls and artifacts have server ids; other kinds
          // fall back to kind + index because their content may grow in place.
          key={
            segment.kind === "tool"
              ? segment.id
              : segment.kind === "visualization"
                ? segment.artifactId
                : `${segment.kind}-${index}`
          }
          segment={segment}
          index={index}
          segments={entry.segments}
          isStreaming={entry.status === "streaming"}
        />
      ))}
    </div>
  );
}

/** Dispatches a single transcript entry to its type-specific renderer. */
function TranscriptEntryView({ entry }: { entry: TranscriptEntry }) {
  switch (entry.transcriptType) {
    case "session_request":
      return (
        <div className="text-xs text-slate-400 break-words">
          {">"} Session started.
        </div>
      );
    case "session_response":
      return <SessionResponseTable data={entry.data} />;
    case "chat_request":
      return <div className="user-bubble">{entry.message}</div>;
    case "chat_run":
      // The ChatRun component is the component that renders the chat run.
      return <ChatRun entry={entry} />;
    case "error":
      return <ErrorBlock message={entry.message} />;
  }
  // Exhaustiveness fallback for unexpected transcript shapes during development.
  return (
    <pre className="wrapped-content">{JSON.stringify(entry, null, 2)}</pre>
  );
}

export function ChatTranscript({ entries }: ChatTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Re-run before paint so new streamed segments scroll into view without flicker.
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [entries]);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
      <div className="content-width">
        {entries.map((entry) => {
          // Styling variables to help with the styling of the transcript entries
          const isUser = entry.transcriptType === "chat_request";
          const isAssistant =
            entry.transcriptType === "chat_run" ||
            entry.transcriptType === "error";
          const isSystem =
            entry.transcriptType === "session_request" ||
            entry.transcriptType === "session_response";

          return (
            <div
              key={entry.id}
              className={`max-w-full ${
                isUser
                  ? "mb-4 flex justify-end"
                  : isAssistant
                    ? "mb-4 flex justify-start"
                    : isSystem
                      ? "mb-2"
                      : "mb-4"
              }`}
            >
              {/* The TranscriptEntryView is the component that renders the transcript entry. */}
              <TranscriptEntryView entry={entry} />
            </div>
          );
        })}
        {/* Bottom spacer clears the fixed composer; bottomRef is the scroll anchor. */}
        <div className="pb-40" />
        <div ref={bottomRef} aria-hidden />
      </div>
    </div>
  );
}
