import { RiExternalLinkLine } from "@remixicon/react";
import { API_BASE } from "../../lib/api";
import { useArtifactType } from "../../lib/useArtifactType";
import { RunSegment } from "../../types/transcript";
import { CsvArtifactTable } from "../CsvArtifactTable";

type VisualizationSegmentViewProps = {
  segment: Extract<RunSegment, { kind: "visualization" }>;
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
        <iframe
          className="h-96 w-full rounded border border-slate-200 bg-white"
          src={artifactUrl}
          title={segment.title}
          loading="lazy"
        />
      ) : (
        <CsvArtifactTable url={artifactUrl} />
      )}
    </div>
  );
}
