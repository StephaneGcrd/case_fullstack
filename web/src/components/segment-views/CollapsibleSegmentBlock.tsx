import { RiArrowDownSLine, RiCheckLine, RiLoader4Line } from "@remixicon/react";
import type { ReactNode } from "react";

type CollapsibleSegmentBlockProps = {
  label: string;
  isActive: boolean;
  children: ReactNode;
};

export function CollapsibleSegmentBlock({
  label,
  isActive,
  children,
}: CollapsibleSegmentBlockProps) {
  return (
    <details className="segment-block group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-slate-600 [&::-webkit-details-marker]:hidden">
        <RiArrowDownSLine
          className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          aria-hidden
        />
        <span>{label}</span>
        {isActive ? (
          <RiLoader4Line
            className="size-4 shrink-0 animate-spin text-slate-400"
            aria-hidden
          />
        ) : (
          <RiCheckLine
            className="size-4 shrink-0 text-emerald-500"
            aria-hidden
          />
        )}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
