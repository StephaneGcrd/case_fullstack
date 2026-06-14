/**
 * Collapsible view for agent tool calls. Parses structured results for known tools
 * (query_data, visualize) and falls back to raw JSON for everything else.
 */
import type { RunSegment, ToolSegment } from "../../types/transcript";
import { CollapsibleSegmentBlock } from "./CollapsibleSegmentBlock";

type ToolSegmentViewProps = {
  segment: ToolSegment;
  index: number;
  segments: RunSegment[];
};

type ParsedQueryResult =
  | { type: "success"; rowCount: number; colCount: number; columns: string[]; rows: string[][] }
  | { type: "error"; message: string };

function getStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Parse the plain-text result string returned by the query_data tool. */
function parseQueryDataResult(result: string): ParsedQueryResult {
  if (result.startsWith("Error")) {
    return { type: "error", message: result };
  }

  const rowMatch = result.match(/Result: (\d+) rows x (\d+) columns/);
  const columnsMatch = result.match(/^Columns: (.+)$/m);
  const previewText = result.split("Preview:\n")[1]?.trim() ?? "";

  const columns = columnsMatch
    ? columnsMatch[1].split(",").map((column) => column.trim())
    : [];

  const previewLines = previewText ? previewText.split("\n").filter(Boolean) : [];
  const dataLines = previewLines.length > 1 ? previewLines.slice(1) : previewLines;
  const rows = dataLines.map((line) => line.trim().split(/\s+/));

  return {
    type: "success",
    rowCount: rowMatch ? Number(rowMatch[1]) : rows.length,
    colCount: rowMatch ? Number(rowMatch[2]) : columns.length,
    columns,
    rows,
  };
}

function formatVisualizeResult(result: string): string {
  const lines = result.split("\n");
  const summary = lines.find(
    (line) => line.startsWith("Table created:") || line.startsWith("Figure created:"),
  );
  return summary ?? lines[0] ?? result;
}

/** Prefer the preceding status line as the summary label (see StatusSegmentView). */
function getToolLabel(
  segment: ToolSegment,
  segments: RunSegment[],
  index: number,
): string {
  const previous = segments[index - 1];
  if (previous?.kind === "status") {
    return previous.text;
  }
  return `Running ${segment.name}…`;
}

function QueryDataToolContent({
  args,
  result,
}: {
  args: Record<string, unknown>;
  result?: string;
}) {
  const description = getStringArg(args, "description");
  const sql = getStringArg(args, "sql");
  const parsed = result ? parseQueryDataResult(result) : null;

  return (
    <div className="space-y-2 text-sm">
      {description && <p className="text-slate-700">{description}</p>}

      {parsed?.type === "error" && (
        <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-red-800">
          {parsed.message}
        </p>
      )}

      {parsed?.type === "success" && (
        <>
          <p className="text-slate-500">
            {parsed.rowCount.toLocaleString()} rows · {parsed.colCount} column
            {parsed.colCount === 1 ? "" : "s"}
          </p>

          {parsed.rows.length > 0 && parsed.columns.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="data-table">
                <thead>
                  <tr>
                    {parsed.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {parsed.columns.map((_, colIndex) => (
                        <td key={colIndex}>{row[colIndex] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {parsed.rowCount > parsed.rows.length && (
            <p className="text-xs text-slate-400">
              Preview of the first {parsed.rows.length} rows
            </p>
          )}
        </>
      )}

      {sql && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
            SQL query
          </summary>
          <pre className="wrapped-content mt-1.5 rounded-md bg-slate-50 p-2 font-mono text-slate-600">
            {sql}
          </pre>
        </details>
      )}
    </div>
  );
}

function VisualizeToolContent({
  args,
  result,
}: {
  args: Record<string, unknown>;
  result?: string;
}) {
  const title = getStringArg(args, "title");
  const description = getStringArg(args, "description");
  const code = getStringArg(args, "code");

  return (
    <div className="space-y-2 text-sm">
      {title && <p className="font-medium text-slate-900">{title}</p>}
      {description && <p className="text-slate-700">{description}</p>}
      {result && <p className="text-slate-500">{formatVisualizeResult(result)}</p>}

      {code && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
            Visualization code
          </summary>
          <pre className="wrapped-content mt-1.5 rounded-md bg-slate-50 p-2 font-mono text-slate-600">
            {code}
          </pre>
        </details>
      )}
    </div>
  );
}

function GenericToolContent({
  name,
  args,
  result,
}: {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}) {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium text-slate-700">{name}</p>
      <details className="text-xs">
        <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
          Parameters
        </summary>
        <pre className="wrapped-content mt-1.5 rounded-md bg-slate-50 p-2 font-mono text-slate-600">
          {JSON.stringify(args, null, 2)}
        </pre>
      </details>
      {result && (
        <pre className="wrapped-content rounded-md bg-slate-50 p-2 text-slate-600">
          {result}
        </pre>
      )}
    </div>
  );
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
      {segment.name === "query_data" ? (
        <QueryDataToolContent args={segment.args} result={segment.result} />
      ) : segment.name === "visualize" ? (
        <VisualizeToolContent args={segment.args} result={segment.result} />
      ) : (
        <GenericToolContent
          name={segment.name}
          args={segment.args}
          result={segment.result}
        />
      )}
    </CollapsibleSegmentBlock>
  );
}
