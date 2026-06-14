# Curl-like API Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TanStack Start home page with a minimal curl-like client that auto-creates a session and streams raw SSE chat output, while preserving the counter demo at `/demo`.

**Architecture:** Browser `fetch` calls go directly to FastAPI on port 8000. Fetch logic lives in `web/src/lib/api.ts`; `web/src/routes/index.tsx` holds only React state and bare HTML. No components, no SSE parsing, no server functions for API calls.

**Tech Stack:** TanStack Start, React 19, TypeScript, Vite

**Spec:** `docs/superpowers/specs/2026-06-14-curl-like-api-client-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `web/src/lib/api.ts` | Create | `API_BASE`, `createSession()`, `streamChat()` |
| `web/src/routes/demo.tsx` | Create | Counter demo moved from `index.tsx` |
| `web/src/routes/index.tsx` | Replace | API client page (textarea, button, pre) |
| `web/src/routes/__root.tsx` | Modify | Update document title |
| `web/src/routeTree.gen.ts` | Auto-regenerated | TanStack router picks up `/demo` on dev/build |

---

### Task 1: API fetch module

**Files:**
- Create: `web/src/lib/api.ts`

- [ ] **Step 1: Create `web/src/lib/api.ts`**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from repo root:

```bash
cd web && npx tsc --noEmit
```

Expected: no errors (file is standalone; route imports come in Task 3).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "Add minimal fetch wrappers for FastAPI agent API."
```

---

### Task 2: Move counter demo to `/demo`

**Files:**
- Create: `web/src/routes/demo.tsx`
- Source: copy from current `web/src/routes/index.tsx`

- [ ] **Step 1: Create `web/src/routes/demo.tsx`**

Copy the entire contents of `web/src/routes/index.tsx`, then change only the route path and component name:

```typescript
// src/routes/demo.tsx
import * as fs from "node:fs";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const filePath = "count.txt";

async function readCount() {
  return parseInt(
    await fs.promises.readFile(filePath, "utf-8").catch(() => "0"),
  );
}

const getCount = createServerFn({
  method: "GET",
}).handler(() => {
  return readCount();
});

const updateCount = createServerFn({ method: "POST" })
  .validator((d: number) => d)
  .handler(async ({ data }) => {
    const count = await readCount();
    await fs.promises.writeFile(filePath, `${count + data}`);
  });

export const Route = createFileRoute("/demo")({
  component: DemoPage,
  loader: async () => await getCount(),
});

function DemoPage() {
  const router = useRouter();
  const state = Route.useLoaderData();

  return (
    <button
      type="button"
      className="bg-blue-500 text-white p-2 rounded-md"
      onClick={() => {
        updateCount({ data: 1 }).then(() => {
          router.invalidate();
        });
      }}
    >
      Add 1 to {state}?
    </button>
  );
}
```

- [ ] **Step 2: Regenerate route tree**

Run:

```bash
cd web && npm run dev
```

Wait for Vite to start, then stop it (Ctrl+C). Confirm `web/src/routeTree.gen.ts` now includes a `/demo` route entry.

Alternatively run a one-off build:

```bash
cd web && npm run build
```

Expected: build succeeds; `routeTree.gen.ts` lists `/demo`.

- [ ] **Step 3: Commit**

```bash
git add web/src/routes/demo.tsx web/src/routeTree.gen.ts
git commit -m "Move TanStack Start counter demo to /demo route."
```

---

### Task 3: API client home page

**Files:**
- Modify: `web/src/routes/index.tsx` (full replace)

- [ ] **Step 1: Replace `web/src/routes/index.tsx`**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/routes/index.tsx
git commit -m "Replace home page with curl-like API client."
```

---

### Task 4: Update document title

**Files:**
- Modify: `web/src/routes/__root.tsx` (line 22)

- [ ] **Step 1: Change page title**

In `web/src/routes/__root.tsx`, replace:

```typescript
title: "TanStack Start Starter",
```

with:

```typescript
title: "Data Analysis Agent",
```

- [ ] **Step 2: Commit**

```bash
git add web/src/routes/__root.tsx
git commit -m "Update app title for API client."
```

---

### Task 5: Manual smoke test

**Prerequisites:** API running on port 8000, web dev server on port 3000.

- [ ] **Step 1: Start API (if not already running)**

From repo root:

```bash
uvicorn api.main:app --reload --port 8000
```

- [ ] **Step 2: Start web dev server**

In a second terminal:

```bash
cd web && npm run dev
```

Expected: Vite listening on `http://localhost:3000`.

- [ ] **Step 3: Test `/` — session creation**

Open `http://localhost:3000/` in a browser.

Expected in `<pre>`:
- Line `>>> POST /sessions`
- Pretty-printed JSON with `session_id` and `datasets`
- `<p>` shows `session_id: <uuid>`

- [ ] **Step 4: Test chat stream**

Type `How many rows in carpriceprediction?` in the textarea, click **Send**.

Expected in `<pre>` (appended below session JSON):
- `>>> POST /sessions/<uuid>/chat`
- `{"message":"How many rows in carpriceprediction?"}`
- Raw SSE lines: `event: run_start`, `data: {...}`, etc., ending with `event: done`

Send button should be disabled while streaming, then re-enabled.

- [ ] **Step 5: Test second message**

Send another message without reloading.

Expected: new request marker and stream appended below the first (history preserved).

- [ ] **Step 6: Test `/demo`**

Open `http://localhost:3000/demo`.

Expected: blue "Add 1 to N?" button still works.

- [ ] **Step 7: Production build**

```bash
cd web && npm run build
```

Expected: build completes with no errors.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Auto `POST /sessions` on load | Task 3 |
| Literal raw SSE passthrough | Task 1 (`streamChat`) |
| Session JSON in output, streams appended | Task 3 |
| Demo at `/demo` | Task 2 |
| Thin `api.ts` + minimal `index.tsx` | Tasks 1, 3 |
| Native HTML only, no Tailwind on client page | Task 3 |
| `API_BASE` constant with comment | Task 1 |
| Errors in `<pre>` | Tasks 1, 3 |
| Send disabled while streaming | Task 3 |
| Update page title | Task 4 |
| Manual test plan | Task 5 |

## Out of scope (do not implement)

- SSE parsing, typed event handlers
- React components, Tailwind on `/`
- Artifacts, TanStack Query, server-function API proxy
- Automated frontend tests
- `VITE_API_BASE` env configuration
