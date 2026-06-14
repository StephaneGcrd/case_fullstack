import { RunSegment } from "../../types/transcript";
import { CollapsibleSegmentBlock } from "./CollapsibleSegmentBlock";

type ToolSegmentViewProps = {
  segment: Extract<RunSegment, { kind: "tool" }>;
  index: number;
  segments: RunSegment[];
};

function formatToolResult(name: string, result: string): string {
  if (name !== "visualize") return result;

  const lines = result.split("\n");
  const summary = lines.find((line) => line.startsWith("Table created:") || line.startsWith("Figure created:"));
  return summary ?? lines[0] ?? result;
}

function getToolLabel(
  segment: Extract<RunSegment, { kind: "tool" }>,
  segments: RunSegment[],
  index: number,
): string {
  const previous = segments[index - 1];
  if (previous?.kind === "status") {
    return previous.text;
  }
  return `Running ${segment.name}…`;
}

export function ToolSegmentView({
  segment,
  index,
  segments,
}: ToolSegmentViewProps) {
  const isActive = segment.result === undefined;

  return (
    <CollapsibleSegmentBlock
      label={getToolLabel(segment, segments, index)}
      isActive={isActive}
    >
      <div className="text-sm font-medium text-slate-700">
        Tool: {segment.name}
      </div>
      <pre className="wrapped-content text-sm text-slate-600">
        {JSON.stringify(segment.args, null, 2)}
      </pre>
      {segment.result && (
        <p className="mt-2 text-sm text-slate-600">
          {formatToolResult(segment.name, segment.result)}
        </p>
      )}
    </CollapsibleSegmentBlock>
  );
}
