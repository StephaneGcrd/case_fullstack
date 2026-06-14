import {
  RiArrowDownSLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowUpSLine,
  RiSearchLine,
} from "@remixicon/react";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 20;

type SortDirection = "asc" | "desc";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || (char === "\r" && next === "\n")) {
      row.push(cell);
      cell = "";
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      if (char === "\r") i++;
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function compareCells(a: string, b: string, direction: SortDirection): number {
  const aNum = Number(a);
  const bNum = Number(b);
  const bothNumeric =
    a.trim() !== "" &&
    b.trim() !== "" &&
    Number.isFinite(aNum) &&
    Number.isFinite(bNum);

  let result: number;
  if (bothNumeric) {
    result = aNum - bNum;
  } else {
    result = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }

  return direction === "asc" ? result : -result;
}

type CsvArtifactTableProps = {
  url: string;
};

export function CsvArtifactTable({ url }: CsvArtifactTableProps) {
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setQuery("");
    setSortColumn(null);
    setSortDirection("asc");
    setPage(0);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const parsed = parseCsv(text);
        if (!parsed.length) {
          setColumns([]);
          setRows([]);
          return;
        }
        const [header, ...body] = parsed;
        setColumns(header);
        setRows(body);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load table");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;

    return rows.filter((row) =>
      row.some((cell) => cell.toLowerCase().includes(normalizedQuery)),
    );
  }, [query, rows]);

  const sortedRows = useMemo(() => {
    if (sortColumn === null) return filteredRows;

    return [...filteredRows].sort((left, right) =>
      compareCells(left[sortColumn] ?? "", right[sortColumn] ?? "", sortDirection),
    );
  }, [filteredRows, sortColumn, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = sortedRows.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  useEffect(() => {
    setPage(0);
  }, [query, sortColumn, sortDirection]);

  useEffect(() => {
    if (page > pageCount - 1) {
      setPage(Math.max(0, pageCount - 1));
    }
  }, [page, pageCount]);

  function toggleSort(columnIndex: number) {
    if (sortColumn === columnIndex) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(columnIndex);
    setSortDirection("asc");
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading table…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">Could not load table: {error}</p>;
  }

  if (!columns.length) {
    return <p className="text-sm text-slate-500">No rows in this table.</p>;
  }

  return (
    <div className="artifact-table">
      <div className="artifact-table-toolbar">
        <label className="artifact-table-search">
          <RiSearchLine className="size-4 shrink-0 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter rows…"
            className="artifact-table-search-input"
          />
        </label>
        <p className="artifact-table-meta">
          {sortedRows.length.toLocaleString()} row
          {sortedRows.length === 1 ? "" : "s"}
          {query.trim() ? ` (filtered from ${rows.length.toLocaleString()})` : ""}
        </p>
      </div>

      <div className="artifact-table-scroll">
        <table className="artifact-table-grid">
          <thead>
            <tr>
              {columns.map((column, columnIndex) => {
                const isSorted = sortColumn === columnIndex;
                return (
                  <th key={`${column}-${columnIndex}`}>
                    <button
                      type="button"
                      className="artifact-table-sort"
                      onClick={() => toggleSort(columnIndex)}
                    >
                      <span>{column}</span>
                      {isSorted ? (
                        sortDirection === "asc" ? (
                          <RiArrowUpSLine className="size-4 shrink-0 text-slate-500" aria-hidden />
                        ) : (
                          <RiArrowDownSLine className="size-4 shrink-0 text-slate-500" aria-hidden />
                        )
                      ) : (
                        <span className="artifact-table-sort-placeholder" aria-hidden />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIndex) => (
              <tr key={`${currentPage}-${rowIndex}`}>
                {columns.map((_, columnIndex) => (
                  <td key={`${rowIndex}-${columnIndex}`}>
                    {row[columnIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedRows.length > PAGE_SIZE && (
        <div className="artifact-table-pagination">
          <button
            type="button"
            className="artifact-table-page-button"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={currentPage === 0}
          >
            <RiArrowLeftSLine className="size-4" aria-hidden />
            Previous
          </button>
          <span className="artifact-table-page-label">
            Page {currentPage + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="artifact-table-page-button"
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
            disabled={currentPage >= pageCount - 1}
          >
            Next
            <RiArrowRightSLine className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
