/**
 * Minimal fetch wrappers for the FastAPI agent API.
 *
 * The browser talks directly to FastAPI (CORS is open in dev).
 * This is intentionally curl-like: no SSE parsing, no abstractions.
 */

// Hardcoded for v1. To change: edit here, or later use import.meta.env.VITE_API_BASE
export const API_BASE = "http://localhost:8000";

/** Shape of POST /sessions response (we only need session_id in the UI). */
export type CreateSessionResponse = {
  session_id: string;
  datasets: Array<{
    name: string;
    rows: number;
    columns: string[];
  }>;
};

/**
 * POST /sessions
 * Creates a new server-side session with datasets loaded from data/.
 */
/** GET /health — returns true when the API is reachable. */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function createSession(): Promise<CreateSessionResponse> {
  const res = await fetch(`${API_BASE}/sessions`, { method: "POST" });

  if (!res.ok) {
    // FastAPI errors come back as JSON text — pass through for display
    throw new Error(await res.text());
  }

  return res.json() as Promise<CreateSessionResponse>;
}

/**
 * POST /sessions/{sessionId}/chat
 *
 * Reads the response body as a raw text stream (SSE wire format).
 * Each decoded chunk is forwarded to onChunk immediately — no parsing.
 */
export async function streamChat(
  sessionId: string,
  message: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  if (!res.body) {
    throw new Error("Response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  // Read chunks until the stream ends (same as curl -N reading stdout)
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
