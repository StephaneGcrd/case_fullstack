import { useEffect, useRef, useState } from "react";

const MIN_HEIGHT = 200;
const INITIAL_HEIGHT = 384;

type FigureArtifactFrameProps = {
  url: string;
  title: string;
};

export function FigureArtifactFrame({ url, title }: FigureArtifactFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        event.data?.type !== "figure-artifact-resize" ||
        typeof event.data.height !== "number"
      ) {
        return;
      }

      setHeight(Math.max(MIN_HEIGHT, Math.ceil(event.data.height)));
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      className="block w-full rounded border border-slate-200 bg-white"
      style={{ height: `${height}px` }}
      src={url}
      title={title}
      loading="lazy"
      scrolling="no"
    />
  );
}
