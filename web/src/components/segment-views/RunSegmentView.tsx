/**
 * Dispatches a single RunSegment to the view matching its kind.
 * Used by ChatRun to render each SSE block in arrival order.
 */
import { RunSegment } from "../../types/transcript";
import { StatusSegmentView } from "./StatusSegmentView";
import { TextSegmentView } from "./TextSegmentView";
import { ThinkingSegmentView } from "./ThinkingSegmentView";
import { ToolSegmentView } from "./ToolSegmentView";
import { VisualizationSegmentView } from "./VisualizationSegmentView";

type RunSegmentViewProps = {
  segment: RunSegment;
  index: number;
  segments: RunSegment[];
  isStreaming: boolean;
};

/** Route one transcript segment to its kind-specific renderer. */
export function RunSegmentView({
  segment,
  index,
  segments,
  isStreaming,
}: RunSegmentViewProps) {
  switch (segment.kind) {
    case "status":
      return (
        <StatusSegmentView
          segment={segment}
          index={index}
          segments={segments}
          isStreaming={isStreaming}
        />
      );
    case "thinking":
      return (
        <ThinkingSegmentView
          segment={segment}
          index={index}
          segments={segments}
          isStreaming={isStreaming}
        />
      );
    case "tool":
      return (
        <ToolSegmentView
          segment={segment}
          index={index}
          segments={segments}
        />
      );
    case "visualization":
      return <VisualizationSegmentView segment={segment} />;
    case "text":
      return <TextSegmentView segment={segment} />;
  }
}
