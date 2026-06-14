import type { CreateSessionResponse } from "../lib/api";

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
      toolCalls: ToolCall[];
      visualizations: Visualization[];
      runId?: string;
      thinking: string;
      text: string;
      status: "streaming" | "done" | "error";
    }
  | { id: string; transcriptType: "error"; message: string };

export type ToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  argsJson?: string;
  result?: string;
};

export type Visualization = {
  artifactId: string;
  title: string;
  url: string;
};
