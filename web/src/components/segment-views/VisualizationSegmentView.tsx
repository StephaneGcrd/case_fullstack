/**
 * Inline preview of a saved artifact (figure or CSV table) produced by the visualize tool.
 * Artifact type may be refined via HEAD request when the SSE hint is ambiguous.
 */
import { RiExternalLinkLine } from "@remixicon/react";
import { API_BASE } from "../../lib/api";
import { useArtifactType } from "../../lib/useArtifactType";
import type { VisualizationSegment } from "../../types/transcript";
import { CsvArtifactTable } from "../artifacts/CsvArtifactTable";
import { FigureArtifactFrame } from "../artifacts/FigureArtifactFrame";

type VisualizationSegmentViewProps = {
  segment: VisualizationSegment;
};

export function VisualizationSegmentView({
  segment,
}: VisualizationSegmentViewProps) {
  const artifactUrl = `${API_BASE}${segment.url}`;
  const artifactType = useArtifactType(artifactUrl, segment.type);

  return (
    <div className="segment-block w-full max-w-full">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-900">{segment.title}</h3>
        <a
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          href={artifactUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <RiExternalLinkLine className="size-3.5" aria-hidden />
          Open
        </a>
      </div>
      {artifactType === "figure" ? (
        <FigureArtifactFrame url={artifactUrl} title={segment.title} />
      ) : (
        <CsvArtifactTable url={artifactUrl} />
      )}
    </div>
  );
}
