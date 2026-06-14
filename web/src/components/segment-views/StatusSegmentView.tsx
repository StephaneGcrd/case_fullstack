/**
 * Renders ephemeral status lines emitted during a chat run (e.g. "Querying data…").
 * Only the latest status is highlighted while streaming; statuses immediately
 * before a tool segment are hidden because the tool block reuses that text as its label.
 */
import type { RunSegment, StatusSegment } from "../../types/transcript";

type StatusSegmentViewProps = {
  segment: StatusSegment;
  index: number;
  segments: RunSegment[];
  isStreaming: boolean;
};

export function StatusSegmentView({
  segment,
  index,
  segments,
  isStreaming,
}: StatusSegmentViewProps) {
  let lastStatusIndex = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].kind === "status") {
      lastStatusIndex = i;
      break;
    }
  }
  const isLastStatus = isStreaming && lastStatusIndex === index;
  const nextSegment = segments[index + 1];
  // ToolSegmentView shows the preceding status as its collapsible label.
  if (nextSegment?.kind === "tool") {
    return null;
  }

  return (
    <div
      className={`text-sm text-slate-500 break-anywhere ${isLastStatus ? "font-medium text-slate-700" : ""}`}
    >
      • {segment.text}
    </div>
  );
}
