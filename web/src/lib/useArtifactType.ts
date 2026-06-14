import { useEffect, useState } from "react";

export function useArtifactType(
  url: string,
  declared: "figure" | "table",
): "figure" | "table" {
  const [type, setType] = useState(declared);

  useEffect(() => {
    setType(declared);
  }, [declared, url]);

  useEffect(() => {
    let cancelled = false;

    fetch(url, { method: "HEAD" })
      .then((res) => {
        if (cancelled || !res.ok) return;
        const contentType = res.headers.get("content-type") ?? "";
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
