/** Renders the assistant's final markdown reply for a chat run. */
import type { TextSegment } from "../../types/transcript";
import { MarkdownContent } from "../MarkdownContent";

type TextSegmentViewProps = {
  segment: TextSegment;
};

export function TextSegmentView({ segment }: TextSegmentViewProps) {
  return (
    <div className="assistant-text-bubble">
      <MarkdownContent>{segment.text}</MarkdownContent>
    </div>
  );
}
