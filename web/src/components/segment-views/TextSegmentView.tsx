import { RunSegment } from "../../types/transcript";
import { MarkdownContent } from "../MarkdownContent";

type TextSegmentViewProps = {
  segment: Extract<RunSegment, { kind: "text" }>;
};

export function TextSegmentView({ segment }: TextSegmentViewProps) {
  return (
    <div className="assistant-text-bubble">
      <MarkdownContent>{segment.text}</MarkdownContent>
    </div>
  );
}
