// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { createSession, streamChat } from "../lib/api";

export const Route = createFileRoute("/")({
  component: ApiClientPage,
});

function ApiClientPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [output, setOutput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // React Strict Mode runs effects twice in dev — guard so we only POST /sessions once
  const sessionInitStarted = useRef(false);

  /** Append text to the curl-style transcript in <pre>. */
  function append(text: string) {
    setOutput((prev) => prev + text);
  }

  // On load: create session and print raw JSON (like curl POST /sessions)
  useEffect(() => {
    if (sessionInitStarted.current) return;
    sessionInitStarted.current = true;

    async function initSession() {
      append(">>> POST /sessions\n");
      try {
        const data = await createSession();
        setSessionId(data.session_id);
        append(`${JSON.stringify(data, null, 2)}\n\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        append(`Error: ${msg}\n\n`);
      }
    }

    void initSession();
  }, []);

  async function handleSend() {
    const trimmed = message.trim();
    if (!sessionId || !trimmed || isStreaming) return;

    // Log the request (curl-style) before streaming the response
    append(`>>> POST /sessions/${sessionId}/chat\n`);
    append(`${JSON.stringify({ message: trimmed })}\n`);

    setIsStreaming(true);
    try {
      await streamChat(sessionId, trimmed, (chunk) => {
        append(chunk);
      });
      append("\n\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      append(`Error: ${msg}\n\n`);
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div>
      <h1>API Client</h1>
      <p>session_id: {sessionId ?? "(creating…)"}</p>

      <textarea
        rows={3}
        cols={60}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your message…"
      />

      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={!sessionId || isStreaming}
      >
        Send
      </button>

      <pre>{output}</pre>
    </div>
  );
}
