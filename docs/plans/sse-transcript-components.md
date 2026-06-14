# Step-by-step: SSE events → UI components

**Goal:** Replace the single `<pre>{output}</pre>` string with structured React state and small components — while keeping the same information visible (session JSON, request lines, thinking, streamed text).

**Prerequisite:** The curl-like client from `docs/superpowers/plans/2026-06-14-curl-like-api-client.md` is working. You can send a message and see raw SSE scroll by.

**What you will learn:**

1. Why a string buffer is the wrong UI model for streaming
2. How to parse SSE wire format in the browser
3. How to fold many small events (`text_delta`) into one UI block (`chat_run`)
4. How to render with a discriminated union + `switch`

**What stays unchanged:** `web/src/lib/api.ts` — it still forwards raw decoded bytes. Parsing happens one layer up, in the page.

---

## Before you start: understand the two layers

Today the flow looks like this:

```
FastAPI SSE  →  streamChat(onChunk)  →  append(string)  →  <pre>
```

Every `text_delta` chunk arrives as text like:

```
event: text_delta
data: {"delta": " hello"}

```

That gets concatenated into one giant string. It works for debugging, but React cannot turn arbitrary substrings into components.

Target flow:

```
FastAPI SSE  →  streamChat(onChunk)  →  parseSseChunk  →  applySseEvent  →  entries[]  →  components
```

| Layer | File | Job |
|-------|------|-----|
| Transport | `api.ts` | Read bytes from `fetch`, call `onChunk` |
| Parse | `lib/sse.ts` | Turn wire text into `{ type, data }` objects |
| Reduce | `lib/transcriptReducer.ts` | Update transcript state from events |
| Render | `ChatTranscript.tsx` | `switch (entry.kind)` → JSX |

**Key idea:** SSE events are *wire protocol*. Transcript entries are *what the user sees*. One `chat_run` entry absorbs dozens of `text_delta` events.

---

## Step 1 — Define the transcript data model

**Create:** `web/src/types/transcript.ts`

This file has no logic — only TypeScript types. That forces you to decide what the UI shows *before* you write parsers or components.

```typescript
import type { CreateSessionResponse } from "../lib/api";

/** One item in the scrollable transcript. */
export type TranscriptEntry =
  | { id: string; kind: "session_request" }
  | { id: string; kind: "session_response"; data: CreateSessionResponse }
  | { id: string; kind: "chat_request"; message: string }
  | {
      id: string;
      kind: "chat_run";
      runId?: string;
      thinking: string;
      text: string;
      status: "streaming" | "done" | "error";
    }
  | { id: string; kind: "error"; message: string };
```

**Why `kind`?** TypeScript narrows the type in a `switch`. After `entry.kind === "chat_run"`, TS knows `entry.text` exists.

**Why `id`?** React needs a stable `key` when rendering a list. Use `crypto.randomUUID()` when you create each entry.

**Checkpoint:** File compiles. No runtime behavior yet.

---

## Step 2 — Parse SSE chunks

**Create:** `web/src/lib/sse.ts`

`streamChat` does not give you whole events. A single network chunk can split mid-line:

```
Chunk 1:  event: text_delta\ndata: {"delta": "hel
Chunk 2:  lo"}\n\n
```

So you need a **buffer**: keep incomplete text between chunk callbacks.

```typescript
export type SseEvent = {
  type: string;
  data: Record<string, unknown>;
};

/**
 * Append a new chunk to the buffer and return any complete SSE events.
 * SSE blocks are separated by a blank line (\n\n).
 */
export function parseSseChunk(
  buffer: string,
  chunk: string,
): { events: SseEvent[]; buffer: string } {
  const combined = buffer + chunk;
  const blocks = combined.split("\n\n");

  // Last piece may be incomplete — keep it for the next chunk
  const rest = blocks.pop() ?? "";

  const events: SseEvent[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;

    const typeMatch = block.match(/^event: (.+)$/m);
    const dataMatch = block.match(/^data: (.+)$/m);

    if (!typeMatch || !dataMatch) continue;

    events.push({
      type: typeMatch[1],
      data: JSON.parse(dataMatch[1]) as Record<string, unknown>,
    });
  }

  return { events, buffer: rest };
}
```

**How to verify without the UI:** Temporarily log in `handleSend`:

```typescript
let sseBuffer = "";
await streamChat(sessionId, trimmed, (chunk) => {
  const parsed = parseSseChunk(sseBuffer, chunk);
  sseBuffer = parsed.buffer;
  for (const e of parsed.events) console.log(e.type, e.data);
});
```

Send a message. DevTools console should show `run_start`, `thinking_delta`, `text_delta`, `done` — not raw `event:` lines.

**Common mistake:** Forgetting to persist `sseBuffer` between chunks. If you reset it to `""` on every callback, JSON in `data:` will be truncated and `JSON.parse` will throw.

---

## Step 3 — Reduce events into transcript entries

**Create:** `web/src/lib/transcriptReducer.ts`

The reducer answers: *given the current list of entries and one new SSE event, what is the new list?*

For this first version, only handle events you already see in the stream:

| SSE event | Effect on state |
|-----------|-----------------|
| `run_start` | Set `runId` on the current `chat_run` |
| `thinking_delta` | Append `data.delta` to `thinking` |
| `text_delta` | Append `data.delta` to `text` |
| `done` | Set `status` to `"done"` |
| `error` | Set `status` to `"error"` (optional: read `data.message`) |

```typescript
import type { TranscriptEntry } from "../types/transcript";
import type { SseEvent } from "./sse";

/** Find the last chat_run entry (the one currently streaming). */
function findActiveRun(entries: TranscriptEntry[]) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].kind === "chat_run") return { index: i, entry: entries[i] };
  }
  return null;
}

export function applySseEvent(
  entries: TranscriptEntry[],
  event: SseEvent,
): TranscriptEntry[] {
  const active = findActiveRun(entries);
  if (!active || active.entry.kind !== "chat_run") return entries;

  const { index, entry } = active;
  const run = { ...entry };

  switch (event.type) {
    case "run_start":
      run.runId = event.data.run_id as string;
      break;
    case "thinking_delta":
      run.thinking += (event.data.delta as string) ?? "";
      break;
    case "text_delta":
      run.text += (event.data.delta as string) ?? "";
      break;
    case "done":
      run.status = "done";
      break;
    case "error":
      run.status = "error";
      break;
    default:
      // Unknown events: ignore for now (tool_call_start, visualization, …)
      return entries;
  }

  const next = [...entries];
  next[index] = run;
  return next;
}
```

**Why copy `{ ...entry }` and `[...entries]`?** React detects state changes by reference. Mutating `entry.text += delta` in place often skips re-renders.

**Why `default: return entries`?** The API emits more event types than you render yet. Ignoring them keeps step 3 small; you add them in step 7.

**Checkpoint:** Combine with step 2 logging:

```typescript
setEntries((prev) => parsed.events.reduce(applySseEvent, prev));
```

You still need `entries` state (step 4) — but the reducer itself has no React imports, so you can reason about it in isolation.

---

## Step 4 — Swap `output: string` for `entries: TranscriptEntry[]`

**Edit:** `web/src/routes/index.tsx`

### 4a. State and imports

Remove:

```typescript
const [output, setOutput] = useState("");
function append(text: string) { ... }
```

Add:

```typescript
import type { TranscriptEntry } from "../types/transcript";
import { parseSseChunk } from "../lib/sse";
import { applySseEvent } from "../lib/transcriptReducer";

const [entries, setEntries] = useState<TranscriptEntry[]>([]);
```

### 4b. Session init

Replace `append(">>> POST /sessions\n")` + JSON string with structured entries:

```typescript
async function initSession() {
  setEntries((prev) => [
    ...prev,
    { id: crypto.randomUUID(), kind: "session_request" },
  ]);

  try {
    const data = await createSession();
    setSessionId(data.session_id);
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "session_response", data },
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "error", message: msg },
    ]);
  }
}
```

### 4c. Send handler

Replace request `append` + raw stream `append` with:

```typescript
async function handleSend() {
  const trimmed = message.trim();
  if (!sessionId || !trimmed || isStreaming) return;

  const runEntryId = crypto.randomUUID();

  setEntries((prev) => [
    ...prev,
    { id: crypto.randomUUID(), kind: "chat_request", message: trimmed },
    {
      id: runEntryId,
      kind: "chat_run",
      thinking: "",
      text: "",
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
      { id: crypto.randomUUID(), kind: "error", message: msg },
    ]);
  } finally {
    setIsStreaming(false);
  }
}
```

### 4d. Pass entries to the transcript

```typescript
<ChatTranscript entries={entries} />
```

**Checkpoint:** App may render nothing useful yet (ChatTranscript still expects `output`). That's fine — focus on no TypeScript errors in `index.tsx`.

---

## Step 5 — Render entries as components

**Edit:** `web/src/components/ChatTranscript.tsx`

Replace the single `<pre>` with a list + `switch`. No CSS required — semantic HTML is enough.

```typescript
import type { TranscriptEntry } from "../types/transcript";

type ChatTranscriptProps = {
  entries: TranscriptEntry[];
};

function SessionRequest() {
  return <div>{">>>"} POST /sessions</div>;
}

function SessionResponse({ data }: { data: TranscriptEntry & { kind: "session_response" }["data"] }) {
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}

function ChatRequest({ message }: { message: string }) {
  return (
    <div>
      <div>{">>>"} POST /sessions/…/chat</div>
      <pre>{JSON.stringify({ message }, null, 2)}</pre>
    </div>
  );
}

function ChatRun({
  runId,
  thinking,
  text,
  status,
}: {
  runId?: string;
  thinking: string;
  text: string;
  status: "streaming" | "done" | "error";
}) {
  return (
    <div>
      {runId && <div>run_id: {runId}</div>}
      {thinking.length > 0 && (
        <details open>
          <summary>thinking</summary>
          <pre>{thinking}</pre>
        </details>
      )}
      {text.length > 0 && <pre>{text}</pre>}
      <div>status: {status}</div>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return <div>Error: {message}</div>;
}

function TranscriptEntryView({ entry }: { entry: TranscriptEntry }) {
  switch (entry.kind) {
    case "session_request":
      return <SessionRequest />;
    case "session_response":
      return <SessionResponse data={entry.data} />;
    case "chat_request":
      return <ChatRequest message={entry.message} />;
    case "chat_run":
      return (
        <ChatRun
          runId={entry.runId}
          thinking={entry.thinking}
          text={entry.text}
          status={entry.status}
        />
      );
    case "error":
      return <ErrorBlock message={entry.message} />;
  }
}

export function ChatTranscript({ entries }: ChatTranscriptProps) {
  return (
    <div>
      {entries.map((entry) => (
        <TranscriptEntryView key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
```

**Manual test:**

1. Start API + web dev server
2. Load `/` — you should see `>>> POST /sessions` and formatted JSON (not one blob)
3. Ask *"what is the car dataset"* — thinking block + text should grow live
4. Ask a follow-up — a **second** `chat_run` block appears below the first

**What you should see vs. before:**

| Before (string) | After (components) |
|-----------------|-------------------|
| `event: text_delta` lines | No wire-format noise |
| One `<pre>` for everything | Separate blocks per request/response |
| Thinking mixed in raw SSE | `<details>` section for thinking |

---

## Step 6 — Sanity checks (debugging guide)

If something looks wrong, check in this order:

### Text stays empty while streaming

- Log `parsed.events` — are `text_delta` events arriving?
- Is `sseBuffer` declared **outside** the `onChunk` callback but **inside** `handleSend`?
- Is `findActiveRun` finding the right entry? (You must push `chat_run` *before* calling `streamChat`.)

### `JSON.parse` error in `parseSseChunk`

- Buffer not carried over between chunks (see step 2).
- Add `try/catch` around `JSON.parse` and `console.warn(block)` to inspect bad blocks.

### Duplicate session requests on load

- Unrelated to this refactor — keep the existing `sessionInitStarted` ref guard.

### UI re-renders but text jumps or duplicates

- Ensure reducer returns a **new** array and **new** `chat_run` object on every delta.

### `thinking_start` / `thinking_end` ignored

- Expected in this guide. Thinking content still arrives via `thinking_delta`. You can use start/end later to toggle `<details open>`.

---

## Step 7 — Extend when ready (not required for first pass)

Once steps 1–6 work, add more event types using the same pattern.

### 7a. Extend `chat_run` type

```typescript
type ToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
};

// inside chat_run:
toolCalls: ToolCall[];
visualizations: Array<{ artifactId: string; title: string; url: string }>;
```

Initialize `toolCalls: []` and `visualizations: []` when creating the entry in `handleSend`.

### 7b. Handle more cases in `applySseEvent`

```typescript
case "tool_call_start":
  run.toolCalls = [
    ...run.toolCalls,
    {
      id: event.data.tool_call_id as string,
      name: event.data.tool_name as string,
      args: event.data.args as Record<string, unknown>,
    },
  ];
  break;

case "tool_result":
  // match tool_call_id, set result on the matching item
  break;

case "visualization":
  run.visualizations = [
    ...run.visualizations,
    {
      artifactId: event.data.artifact_id as string,
      title: event.data.title as string,
      url: event.data.url as string,
    },
  ];
  break;
```

### 7c. Add subcomponents in `ChatRun`

```typescript
{toolCalls.map((tc) => (
  <div key={tc.id}>
    tool: {tc.name}
    <pre>{JSON.stringify(tc.args, null, 2)}</pre>
    {tc.result && <pre>{tc.result}</pre>}
  </div>
))}
```

Reference for all SSE types: `api/streaming/events.py`.

---

## File map (summary)

| File | Action |
|------|--------|
| `web/src/types/transcript.ts` | **Create** — UI data model |
| `web/src/lib/sse.ts` | **Create** — wire format parser |
| `web/src/lib/transcriptReducer.ts` | **Create** — event → state |
| `web/src/routes/index.tsx` | **Edit** — `entries` state, parse on chunk |
| `web/src/components/ChatTranscript.tsx` | **Edit** — render by `kind` |
| `web/src/lib/api.ts` | **Unchanged** |

---

## Suggested order of work

Do one step, run the app, confirm behavior, then continue. Avoid implementing steps 1–5 in one shot — if the transcript is blank, you won't know whether parse or render failed.

1. Types only (step 1)
2. Parser + `console.log` (step 2)
3. Reducer + log mutated run (step 3)
4. Wire `index.tsx` (step 4)
5. Components (step 5)
6. Tool/visualization events (step 7) when you want richer UI

---

## Mental model to keep

```
Many SSE events  →  few transcript entries  →  few components
```

`text_delta` is high frequency; `<ChatRun>` is low frequency. The reducer is the bridge.

When you add styling later, only the leaf components (`ChatRun`, `SessionResponse`, …) need to change — `index.tsx` and `api.ts` stay the same.
