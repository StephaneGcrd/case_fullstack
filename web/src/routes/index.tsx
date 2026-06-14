// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChatInput } from "../components/ChatInput";
import { ChatTranscript } from "../components/ChatTranscript";
import { createSession, streamChat } from "../lib/api";
import { parseSseChunk } from "../lib/sse";
import { applySseEvent, findActiveRun } from "../lib/transcriptReducer";
import { TranscriptEntry } from "../types/transcript";

export const Route = createFileRoute("/")({
  component: ApiClientPage,
});

function ApiClientPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // React Strict Mode runs effects twice in dev — guard so we only POST /sessions once
  const sessionInitStarted = useRef(false);

  // On load: create session and print raw JSON (like curl POST /sessions)
  useEffect(() => {
    if (sessionInitStarted.current) return;
    sessionInitStarted.current = true;

    async function initSession() {
      setEntries((prev) => [
        ...prev,
        { id: crypto.randomUUID(), transcriptType: "session_request" },
      ]);

      try {
        const data = await createSession();
        setSessionId(data.session_id);
        setEntries((prev) => [
          ...prev,
          { id: crypto.randomUUID(), transcriptType: "session_response", data },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setEntries((prev) => [
          ...prev,
          { id: crypto.randomUUID(), transcriptType: "error", message: msg },
        ]);
      }
    }

    void initSession();
  }, []);

  async function handleSend() {
    const trimmed = message.trim();

    if (!sessionId || !trimmed || isStreaming) return;

    const runEntryId = crypto.randomUUID();

    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        transcriptType: "chat_request",
        message: trimmed,
      },
      {
        id: runEntryId,
        transcriptType: "chat_run",
        thinking: "",
        text: "",
        toolCalls: [],
        visualizations: [],
        status: "streaming",
      },
    ]);

    setIsStreaming(true);
    let sseBuffer = "";

    try {
      await streamChat(sessionId, trimmed, (chunk) => {
        const parsed = parseSseChunk(sseBuffer, chunk);

        sseBuffer = parsed.buffer;
        setEntries((prev) => parsed.events.reduce(applySseEvent, prev));
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setEntries((prev) => [
        ...prev,
        { id: crypto.randomUUID(), transcriptType: "error", message: msg },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex h-full min-h-screen flex-col">
      <div className="shrink-0">
        <h1>API Client</h1>
        <p>session_id: {sessionId ?? "(creating…)"}</p>
      </div>

      <ChatInput
        message={message}
        onMessageChange={setMessage}
        onSend={handleSend}
        disabled={!sessionId || isStreaming}
      />

      <ChatTranscript entries={entries} />
    </div>
  );
}
