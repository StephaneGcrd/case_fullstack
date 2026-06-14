import type { TranscriptEntry } from "../types/transcript";
import type { SseEvent } from "./sse";

/** Find the last chat_run entry (the one currently streaming). */
export function findActiveRun(entries: TranscriptEntry[]) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].transcriptType === "chat_run")
      return { index: i, entry: entries[i] };
  }
  return null;
}

export function applySseEvent(
  entries: TranscriptEntry[],
  event: SseEvent,
): TranscriptEntry[] {
  const active = findActiveRun(entries);
  if (!active || active.entry.transcriptType !== "chat_run") return entries;

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
    case "status": {
      const statusText = event.data.text as string | undefined;
      if (statusText) run.statuses = [...run.statuses, statusText];
      break;
    }
    case "done":
      run.status = "done";
      break;
    case "error":
      run.status = "error";
      break;

    case "tool_call_start":
      run.toolCalls = [
        ...run.toolCalls,
        {
          id: event.data.tool_call_id as string,
          name: event.data.tool_name as string,
          args: (event.data.args as Record<string, unknown>) ?? {},
        },
      ];
      break;
    case "tool_call_delta": {
      const id = event.data.tool_call_id as string;
      run.toolCalls = run.toolCalls.map((tc) =>
        tc.id === id
          ? {
              ...tc,
              argsJson: (tc.argsJson ?? "") + (event.data.args_delta as string),
            }
          : tc,
      );
      break;
    }
    case "tool_result": {
      const id = event.data.tool_call_id as string;
      const content = event.data.content as string;
      run.toolCalls = run.toolCalls.map((tc) =>
        tc.id === id ? { ...tc, result: content } : tc,
      );
      break;
    }
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

    default:
      // Unknown event types: ignore.
      return entries;
  }

  const next = [...entries];
  next[index] = run;
  return next;
}
