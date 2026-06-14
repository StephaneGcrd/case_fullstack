import type { RunSegment, ToolSegment, TranscriptEntry } from "../types/transcript";
import type { SseEvent } from "./sse";

/** Find the last chat_run entry (the one currently streaming). */
export function findActiveRun(entries: TranscriptEntry[]) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].transcriptType === "chat_run")
      return { index: i, entry: entries[i] };
  }
  return null;
}

/** Append a streaming text delta, merging into the previous segment when possible. */
function appendTextSegment(
  segments: RunSegment[],
  kind: "thinking" | "text",
  delta: string,
): RunSegment[] {
  const last = segments.at(-1);
  // Consecutive deltas of the same kind become one segment instead of many
  // tiny blocks in the transcript.
  if (last?.kind === kind) {
    return [...segments.slice(0, -1), { kind, text: last.text + delta }];
  }
  return [...segments, { kind, text: delta }];
}

/** Update a single in-flight tool segment matched by tool_call_id. */
function updateToolSegment(
  segments: RunSegment[],
  id: string,
  update: (segment: ToolSegment) => RunSegment,
): RunSegment[] {
  return segments.map((segment) =>
    segment.kind === "tool" && segment.id === id ? update(segment) : segment,
  );
}

/**
 * Immutable reducer that folds one SSE event into the transcript.
 *
 * Only the active chat_run entry is mutated; all other entries are reused.
 */
export function applySseEvent(
  entries: TranscriptEntry[],
  event: SseEvent,
): TranscriptEntry[] {
  console.log(entries);
  const active = findActiveRun(entries);
  console.log(active);
  if (!active || active.entry.transcriptType !== "chat_run") return entries;

  const { index, entry } = active;
  const run = { ...entry, segments: [...entry.segments] };

  switch (event.type) {
    case "run_start":
      run.runId = event.data.run_id as string;
      break;

    // Streaming assistant output
    case "thinking_delta":
      run.segments = appendTextSegment(
        run.segments,
        "thinking",
        (event.data.delta as string) ?? "",
      );
      break;
    case "text_delta":
      run.segments = appendTextSegment(
        run.segments,
        "text",
        (event.data.delta as string) ?? "",
      );
      break;
    case "status": {
      const statusText = event.data.text as string | undefined;
      if (statusText) {
        run.segments = [...run.segments, { kind: "status", text: statusText }];
      }
      break;
    }

    // Run lifecycle
    case "done":
      run.status = "done";
      break;
    case "error":
      run.status = "error";
      break;

    // Tool call lifecycle: start → streamed args JSON → final result
    case "tool_call_start":
      run.segments = [
        ...run.segments,
        {
          kind: "tool",
          id: event.data.tool_call_id as string,
          name: event.data.tool_name as string,
          args: (event.data.args as Record<string, unknown>) ?? {},
        },
      ];
      break;
    case "tool_call_delta": {
      const id = event.data.tool_call_id as string;
      run.segments = updateToolSegment(run.segments, id, (segment) => ({
        ...segment,
        argsJson: (segment.argsJson ?? "") + (event.data.args_delta as string),
      }));
      break;
    }
    case "tool_result": {
      const id = event.data.tool_call_id as string;
      const content = event.data.content as string;
      run.segments = updateToolSegment(run.segments, id, (segment) => ({
        ...segment,
        result: content,
      }));
      break;
    }

    case "visualization":
      run.segments = [
        ...run.segments,
        {
          kind: "visualization",
          artifactId: event.data.artifact_id as string,
          title: event.data.title as string,
          url: event.data.url as string,
          type: (event.data.type as "figure" | "table") ?? "figure",
        },
      ];
      break;

    // Unknown event types are ignored so older clients stay compatible.
    default:
      return entries;
  }

  const next = [...entries];
  next[index] = run;
  return next;
}
