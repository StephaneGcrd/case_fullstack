// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChatInput } from "../components/ChatInput";
import { ChatTranscript } from "../components/ChatTranscript";
import { checkHealth, createSession, streamChat } from "../lib/api";
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
  const [isOnline, setIsOnline] = useState(false);

  // React Strict Mode runs effects twice in dev — guard so we only POST /sessions once
  const sessionInitStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function pollHealth() {
      const ok = await checkHealth();
      if (!cancelled) setIsOnline(ok);
    }

    void pollHealth();
    const intervalId = setInterval(pollHealth, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

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

    setMessage("");

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
        segments: [],
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
    <div className="flex h-full min-h-screen min-w-0 flex-col overflow-x-hidden">
      <div className="">
        <div className="shadow-sm flex h-10 items-center gap-2 px-4 py-2">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-400"}`}
            aria-label={isOnline ? "API connected" : "API offline"}
            title={isOnline ? "Connected" : "Offline"}
          />
          <p className="text-sm text-gray-500">Cas pratique - Matr</p>
        </div>
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
