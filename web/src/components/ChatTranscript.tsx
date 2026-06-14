import { useLayoutEffect, useRef } from "react";
import { API_BASE } from "../lib/api";
import { RunSegment, TranscriptEntry } from "../types/transcript";

type ChatTranscriptProps = {
  entries: TranscriptEntry[];
};

function ErrorBlock({ message }: { message: string }) {
  return <div>Error: {message}</div>;
}

function RunSegmentView({
  segment,
  index,
  segments,
  isStreaming,
}: {
  segment: RunSegment;
  index: number;
  segments: RunSegment[];
  isStreaming: boolean;
}) {
  switch (segment.kind) {
    case "status": {
      let lastStatusIndex = -1;
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].kind === "status") {
          lastStatusIndex = i;
          break;
        }
      }
      const isLastStatus = isStreaming && lastStatusIndex === index;
      return (
        <div
          className={`my-1 text-sm text-gray-500 ${isLastStatus ? "font-medium" : ""}`}
        >
          • {segment.text}
        </div>
      );
    }
    case "thinking":
      return (
        <details open>
          <summary>thinking</summary>
          <pre>{segment.text}</pre>
        </details>
      );
    case "tool":
      return (
        <div>
          <div>tool: {segment.name}</div>
          <pre>{JSON.stringify(segment.args, null, 2)}</pre>
          {segment.result && <pre>{segment.result}</pre>}
        </div>
      );
    case "visualization":
      return (
        <div>
          <a
            href={`${API_BASE}${segment.url}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {segment.title}
          </a>
        </div>
      );
    case "text":
      return <pre>{segment.text}</pre>;
  }
}

function ChatRun({
  entry,
}: {
  entry: Extract<TranscriptEntry, { transcriptType: "chat_run" }>;
}) {
  return (
    <div>
      {entry.runId && <div>run_id: {entry.runId}</div>}
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
      <div>status: {entry.status}</div>
    </div>
  );
}

function TranscriptEntryView({ entry }: { entry: TranscriptEntry }) {
  switch (entry.transcriptType) {
    case "session_request":
      return <div>{">>>"} POST /sessions</div>;
    case "session_response":
      return <pre>{JSON.stringify(entry.data, null, 2)}</pre>;
    case "chat_request":
      return <div>{">>>"} POST /sessions/…/chat</div>;
    case "chat_run":
      return (
        <div>
          <ChatRun entry={entry} />
        </div>
      );
    case "error":
      return <ErrorBlock message={entry.message} />;
  }
  return <div>{JSON.stringify(entry, null, 2)}</div>;
}

export function ChatTranscript({ entries }: ChatTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [entries]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {entries.map((entry) => (
        <TranscriptEntryView key={entry.id} entry={entry} />
      ))}
      <div className="pb-40" />
      <div ref={bottomRef} aria-hidden />
    </div>
  );
}
