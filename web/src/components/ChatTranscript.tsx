import { useLayoutEffect, useRef } from "react";
import { API_BASE } from "../lib/api";
import { TranscriptEntry } from "../types/transcript";

type ChatTranscriptProps = {
  entries: TranscriptEntry[];
};

function ErrorBlock({ message }: { message: string }) {
  return <div>Error: {message}</div>;
}

function ChatRun({
  entry,
}: {
  entry: Extract<TranscriptEntry, { transcriptType: "chat_run" }>;
}) {
  return (
    <div>
      {entry.statuses.length > 0 && (
        <div className="my-1 text-sm text-gray-500">
          {entry.statuses.map((s, i) => (
            <div
              key={i}
              className={
                i === entry.statuses.length - 1 && entry.status === "streaming"
                  ? "font-medium"
                  : ""
              }
            >
              • {s}
            </div>
          ))}
        </div>
      )}
      {entry.runId && <div>run_id: {entry.runId}</div>}
      {entry.thinking.length > 0 && (
        <details open>
          <summary>thinking</summary>
          <pre>{entry.thinking}</pre>
        </details>
      )}
      {entry.toolCalls.map((tc) => (
        <div key={tc.id}>
          <div>tool: {tc.name}</div>
          <pre>{JSON.stringify(tc.args, null, 2)}</pre>
          {tc.result && <pre>{tc.result}</pre>}
        </div>
      ))}
      {entry.visualizations.map((v) => (
        <div key={v.artifactId}>
          <a
            href={`${API_BASE}${v.url}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {v.title}
          </a>
        </div>
      ))}

      {entry.text.length > 0 && <pre>{entry.text}</pre>}
      <div>status: {entry.status}</div>
    </div>
  );
}

function TranscriptEntryView({ entry }: { entry: TranscriptEntry }) {
  console.log("entry", entry);

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

  console.log("entries transcript", entries);
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
