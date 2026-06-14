# Curl-like API Client — Design Spec

**Date:** 2026-06-14  
**Status:** Approved (pending final spec review)  
**Scope:** Frontend v1 — minimal browser client for the FastAPI agent API

## Goal

Build a first-iteration web client on top of the existing TanStack Start app in `web/`. The client **uses** the API (sends messages, reads responses) — it is not a debug dashboard or polished chat UI.

Behavior should feel like running `curl` in a terminal: type a message, send it, watch the raw response scroll by. Code must stay simple, readable, and commented so it can be followed line by line.

## Context

- **Backend:** FastAPI on `http://localhost:8000` — see `docs/api.md`
- **Frontend:** TanStack Start (React Router + Vite) on port 3000
- **Chat endpoint:** `POST /sessions/{id}/chat` returns `text/event-stream` (SSE wire format)
- **CORS:** Enabled for dev (`Access-Control-Allow-Origin: *`)
- **Existing starter:** Counter demo with server functions lives in `web/src/routes/index.tsx`

## Decisions

| Topic | Decision |
|-------|----------|
| Session creation | Auto `POST /sessions` on page load |
| Output format | Literal raw text — same bytes `curl -N` would print for SSE |
| Session response | Appended to output area on load; chat streams appended below |
| Starter demo | Moved to `/demo`; API client replaces `/` |
| Code structure | Thin `web/src/lib/api.ts` + minimal `web/src/routes/index.tsx` |
| UI | Native HTML only (`textarea`, `button`, `pre`) — no React components, no Tailwind classes |
| API base URL | Constant `http://localhost:8000` in `api.ts` (comment notes future env var) |
| SSE parsing | None in v1 — pass through decoded stream chunks as-is |
| Server functions | Not used for API calls — browser `fetch` directly to FastAPI |
| Automated tests | None in v1 — manual smoke test only |

## Architecture

```
┌─────────────────────────────────────────┐
│  /  (index.tsx)                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ message     │  │ Send             │  │
│  │ (textarea)  │  │ (button)         │  │
│  └─────────────┘  └──────────────────┘  │
│  session_id: <uuid>                     │
│  ┌─────────────────────────────────────┐│
│  │ <pre> — append-only raw output      ││
│  │ >>> POST /sessions                  ││
│  │ { "session_id": "...", ... }        ││
│  │ >>> POST /sessions/{id}/chat        ││
│  │ event: run_start                    ││
│  │ data: {"run_id":"..."}              ││
│  │ ...                                 ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
         │ fetch (browser → :8000)
         ▼
   FastAPI @ localhost:8000
```

### Files

| File | Role |
|------|------|
| `web/src/lib/api.ts` | `API_BASE`, `createSession()`, `streamChat(onChunk)` — plain fetch, heavily commented |
| `web/src/routes/index.tsx` | API client page: state, effects, bare HTML |
| `web/src/routes/demo.tsx` | Existing counter demo (moved from `index.tsx`) |
| `web/src/routes/__root.tsx` | Update page title to reflect app purpose |

### Out of scope (v1)

- SSE event parsing or typed handlers
- React components, design system, Tailwind styling
- Chat bubbles, thinking panels, tool cards, artifact rendering
- TanStack Query, server functions as API proxy
- `GET /artifacts/{id}` integration
- Environment-based API URL configuration (hardcoded constant only)

## Data flow

### On mount

1. `useEffect` runs once on `/`
2. Call `createSession()` → `POST /sessions`
3. Append to output:
   ```
   >>> POST /sessions
   <JSON response, pretty-printed>
   ```
4. Store `session_id` in React state; show in a `<p>` label

### On Send

1. Guard: skip if no session, empty message, or `isStreaming === true`
2. Append request marker:
   ```
   >>> POST /sessions/{session_id}/chat
   {"message":"<user text>"}
   ```
3. Set `isStreaming = true`; disable Send button
4. Call `streamChat(sessionId, message, onChunk)`
5. Each decoded chunk from the reader → append to output string (no parsing)
6. On completion or error → set `isStreaming = false`

### `api.ts` — `createSession()`

```typescript
// POST /sessions — returns parsed JSON for session_id extraction
const res = await fetch(`${API_BASE}/sessions`, { method: "POST" });
if (!res.ok) throw new Error(await res.text());
return res.json();
```

### `api.ts` — `streamChat()`

```typescript
// POST /sessions/{id}/chat — reads body as raw text stream
const res = await fetch(`${API_BASE}/sessions/${sessionId}/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message }),
});
if (!res.ok) throw new Error(await res.text());

const reader = res.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  onChunk(decoder.decode(value, { stream: true }));
}
```

No SSE block splitting or JSON parsing — chunks are forwarded exactly as received.

## Page state (`index.tsx`)

| State | Type | Purpose |
|-------|------|---------|
| `sessionId` | `string \| null` | From `POST /sessions` |
| `output` | `string` | Append-only log shown in `<pre>` |
| `isStreaming` | `boolean` | Blocks concurrent chat requests (avoids 409) |
| `message` | `string` | Controlled textarea value |

## Error handling

All errors appear in the same `<pre>` block — no toasts or modals.

| Situation | Output |
|-----------|--------|
| Session creation fails | `>>> POST /sessions` followed by error text / JSON body |
| Chat returns 404, 409, or 422 | Request marker + raw JSON error from FastAPI |
| Network failure | `Error: <message>` appended |
| Stream interrupted | Partial stream preserved; `Error: …` appended after |

Send button disabled while `isStreaming` to prevent overlapping chat streams on the same session.

## Demo route migration

Move the existing counter logic from `index.tsx` to `demo.tsx`:

- Keep `createServerFn`, `count.txt`, loader, and button unchanged
- Route path: `/demo`
- TanStack file-based routing will regenerate `routeTree.gen.ts` on next dev/build

## Manual test plan

1. Start API: `uvicorn api.main:app --reload --port 8000`
2. Start web: `cd web && npm run dev` (port 3000)
3. Open `/` — output shows `>>> POST /sessions` and JSON with `session_id`
4. Type a message, click Send — SSE lines (`event:`, `data:`) appear live in `<pre>`
5. Send a second message — new block appended below the first stream
6. Open `/demo` — counter button still works

## Future iterations (not in v1)

- Parse SSE events into structured state
- Render assistant text, thinking, tools, artifacts
- `VITE_API_BASE` env var
- Fetch artifacts when `visualization` events arrive
- Optional "New session" button
