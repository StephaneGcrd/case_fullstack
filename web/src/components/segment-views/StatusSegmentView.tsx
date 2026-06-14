import { RunSegment } from "../../types/transcript";

type StatusSegmentViewProps = {
  segment: Extract<RunSegment, { kind: "status" }>;
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
