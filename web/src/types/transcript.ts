import type { CreateSessionResponse } from "../lib/api";

export type StatusSegment = { kind: "status"; text: string };

export type ThinkingSegment = { kind: "thinking"; text: string };

export type TextSegment = { kind: "text"; text: string };

export type ToolSegment = {
  kind: "tool";
  id: string;
  name: string;
  args: Record<string, unknown>;
  argsJson?: string;
  result?: string;
};

export type VisualizationSegment = {
  kind: "visualization";
  artifactId: string;
  title: string;
  url: string;
  type: "figure" | "table";
};

/** One chronological block inside a chat run, in SSE arrival order. */
export type RunSegment =
  | StatusSegment
  | ThinkingSegment
  | TextSegment
  | ToolSegment
  | VisualizationSegment;

export type SessionRequestEntry = {
  id: string;
  transcriptType: "session_request";
};

export type SessionResponseEntry = {
  id: string;
  transcriptType: "session_response";
  data: CreateSessionResponse;
};

export type ChatRequestEntry = {
  id: string;
  transcriptType: "chat_request";
  message: string;
};

export type ChatRunEntry = {
  id: string;
  transcriptType: "chat_run";
  runId?: string;
  segments: RunSegment[];
  status: "streaming" | "done" | "error";
};

export type ErrorEntry = {
  id: string;
  transcriptType: "error";
  message: string;
};

/** One item in the scrollable transcript. */
export type TranscriptEntry =
  | SessionRequestEntry
  | SessionResponseEntry
  | ChatRequestEntry
  | ChatRunEntry
  | ErrorEntry;
