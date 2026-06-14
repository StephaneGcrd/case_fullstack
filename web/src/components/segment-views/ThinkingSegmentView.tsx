/** Collapsible view for the model's reasoning trace, active until the run finishes. */
import type { RunSegment, ThinkingSegment } from "../../types/transcript";
import { CollapsibleSegmentBlock } from "./CollapsibleSegmentBlock";

type ThinkingSegmentViewProps = {
  segment: ThinkingSegment;
  index: number;
  segments: RunSegment[];
  isStreaming: boolean;
};

export function ThinkingSegmentView({
  segment,
  index,
  segments,
  isStreaming,
}: ThinkingSegmentViewProps) {
  const isActive = isStreaming && index === segments.length - 1;

  return (
    <CollapsibleSegmentBlock label="Thinking" isActive={isActive}>
      <pre className="wrapped-content text-sm text-slate-700">{segment.text}</pre>
    </CollapsibleSegmentBlock>
  );
}
