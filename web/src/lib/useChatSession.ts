/**
 * React orchestration for the chat page: session bootstrap, API health,
 * composer state, and SSE transcript updates.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptEntry } from "../types/transcript";
import { checkHealth, createSession, streamChat } from "./api";
import { parseSseChunk } from "./sse";
import { applySseEvent } from "./transcriptReducer";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useChatSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  // React Strict Mode runs effects twice in dev; guard so we only POST /sessions once.
  const sessionInitStarted = useRef(false);

  // Poll /health every 5s to drive the header connection indicator.
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

  // On mount: append a session_request row, POST /sessions, then show the raw response.
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
        setEntries((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            transcriptType: "error",
            message: toErrorMessage(err),
          },
        ]);
      }
    }

    void initSession();
  }, []);

  const send = useCallback(async () => {
    const trimmed = message.trim();

    if (!sessionId || !trimmed || isStreaming) return;

    setMessage("");

    // chat_request and chat_run are appended together so the assistant block
    // exists before the first SSE chunk arrives.
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        transcriptType: "chat_request",
        message: trimmed,
      },
      {
        id: crypto.randomUUID(),
        transcriptType: "chat_run",
        segments: [],
        status: "streaming",
      },
    ]);

    setIsStreaming(true);
    // SSE chunks may split mid-event; parseSseChunk reassembles before reduce.
    let sseBuffer = "";

    try {
      await streamChat(sessionId, trimmed, (chunk) => {
        const parsed = parseSseChunk(sseBuffer, chunk);

        sseBuffer = parsed.buffer;

        // The applySseEvent function is used to apply the SSE events to the entries.
        // parsed returns the events and the buffer. (buffer being the remaining part of the SSE event)
        setEntries((prev) => parsed.events.reduce(applySseEvent, prev));
      });
    } catch (err) {
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          transcriptType: "error",
          message: toErrorMessage(err),
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, message, sessionId]);

  return {
    entries,
    message,
    setMessage,
    send,
    canSend: Boolean(sessionId) && !isStreaming,
    isOnline,
  };
}
