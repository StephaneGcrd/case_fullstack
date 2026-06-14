import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
  ),
  h1: ({ children }) => (
    <h1 className="mb-3 mt-1 text-xl font-semibold">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h3>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-4 border-slate-300 pl-3 text-slate-600 last:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={`block font-mono text-sm text-slate-800 ${className ?? ""}`}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[0.875em] text-slate-800">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg bg-slate-200/60 p-3 font-mono text-sm leading-relaxed last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-200/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-slate-300 px-3 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-slate-300 px-3 py-1.5 align-top">{children}</td>
  ),
  hr: () => <hr className="my-4 border-slate-300" />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
};

type MarkdownContentProps = {
  children: string;
  className?: string;
};

export function MarkdownContent({ children, className = "" }: MarkdownContentProps) {
  return (
    <div
      className={`max-w-full overflow-hidden break-words [overflow-wrap:anywhere] ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
