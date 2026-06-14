import type { CreateSessionResponse } from "../lib/api";

/** One chronological block inside a chat run, in SSE arrival order. */
export type RunSegment =
  | { kind: "status"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      args: Record<string, unknown>;
      argsJson?: string;
      result?: string;
    }
  | {
      kind: "visualization";
      artifactId: string;
      title: string;
      url: string;
      type: "figure" | "table";
    };

/** One item in the scrollable transcript. */
export type TranscriptEntry =
  | { id: string; transcriptType: "session_request" }
  | {
      id: string;
      transcriptType: "session_response";
      data: CreateSessionResponse;
    }
  | { id: string; transcriptType: "chat_request"; message: string }
  | {
      id: string;
      transcriptType: "chat_run";
      runId?: string;
      segments: RunSegment[];
      status: "streaming" | "done" | "error";
    }
  | { id: string; transcriptType: "error"; message: string };
