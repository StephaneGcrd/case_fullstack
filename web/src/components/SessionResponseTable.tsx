/**
 * Renders the dataset catalog returned when a session is created.
 * Shown in the chat transcript as the `session_response` entry (see ChatTranscript).
 */
import { RiTableLine } from "@remixicon/react";
import type { CreateSessionResponse } from "../lib/api";

type SessionResponseTableProps = {
  data: CreateSessionResponse;
};

type Dataset = CreateSessionResponse["datasets"][number];

/** Summary card for one loaded dataset: name, row count, and column names. */
function DatasetCard({ dataset }: { dataset: Dataset }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
      <h3 className="flex items-center gap-1 text-sm leading-tight font-semibold text-slate-900">
        <RiTableLine
          size={14}
          className="shrink-0 text-slate-400"
          aria-hidden
        />
        {dataset.name}
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">
        {dataset.rows.toLocaleString()} rows
      </p>
      <div className="mt-2 border-t border-slate-100 pt-2">
        <p className="mb-1 text-[0.625rem] font-medium tracking-wide text-slate-400 uppercase">
          Columns
        </p>
        <ul className="flex flex-wrap gap-1">
          {dataset.columns.map((column) => (
            <li
              key={column}
              className="rounded bg-slate-100 px-1.5 py-px font-mono text-[0.625rem] leading-snug text-slate-700"
            >
              {column}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/** Grid of dataset cards from POST /sessions. */
export function SessionResponseTable({ data }: SessionResponseTableProps) {
  return (
    <div className="session-response">
      <p className="session-response-label">Available datasets</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {data.datasets.map((dataset) => (
          <DatasetCard key={dataset.name} dataset={dataset} />
        ))}
      </div>
    </div>
  );
}
