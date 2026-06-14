import { useLayoutEffect, useRef } from "react";
import { TranscriptEntry } from "../types/transcript";
import { RunSegmentView } from "./segment-views/RunSegmentView";
import { SessionResponseTable } from "./SessionResponseTable";

type ChatTranscriptProps = {
  entries: TranscriptEntry[];
};

function ErrorBlock({ message }: { message: string }) {
  return <div className="error-block">Error: {message}</div>;
}

function ChatRun({
  entry,
}: {
  entry: Extract<TranscriptEntry, { transcriptType: "chat_run" }>;
}) {
  return (
    <div className="flex w-full max-w-full flex-col items-start gap-3 overflow-hidden">
      {entry.segments.map((segment, index) => (
        <RunSegmentView
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
      return <ChatRun entry={entry} />;
    case "error":
      return <ErrorBlock message={entry.message} />;
  }
  return <pre className="wrapped-content">{JSON.stringify(entry, null, 2)}</pre>;
}

export function ChatTranscript({ entries }: ChatTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [entries]);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
      <div className="content-width">
        {entries.map((entry) => {
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
              <TranscriptEntryView entry={entry} />
            </div>
          );
        })}
        {/* Padding to see the chat above the composer (and element for autoscroll) */}
        <div className="pb-40" />
        <div ref={bottomRef} aria-hidden />
      </div>
    </div>
  );
}
