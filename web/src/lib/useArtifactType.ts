import { useEffect, useState } from "react";

/**
 * Resolves how a visualization artifact should be rendered.
 *
 * Starts from the type declared in the transcript segment, then refines it
 * with a lightweight HEAD request when the server exposes a Content-Type.
 */
export function useArtifactType(
  url: string,
  declared: "figure" | "table",
): "figure" | "table" {
  const [type, setType] = useState(declared);

  // Reset when the segment or artifact URL changes so stale sniff results
  // do not leak across renders.
  useEffect(() => {
    setType(declared);
  }, [declared, url]);

  useEffect(() => {
    let cancelled = false;

    fetch(url, { method: "HEAD" })
      .then((res) => {
        if (cancelled || !res.ok) return;
        const contentType = res.headers.get("content-type") ?? "";
        // Prefer the response MIME type over the declared segment type.
        if (contentType.includes("csv")) {
          setType("table");
        } else if (contentType.includes("html")) {
          setType("figure");
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [url]);

  return type;
}
