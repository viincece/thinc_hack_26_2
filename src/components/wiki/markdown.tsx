import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content }: { content: string }) {
  return (
    <div className="space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a
              {...props}
              className="text-sky-600 underline-offset-2 hover:underline"
            />
          ),
          code: ({ children, ...props }) => (
            <code
              {...props}
              className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-md bg-zinc-50 p-3 text-xs leading-5 dark:bg-zinc-900">
              {children}
            </pre>
          ),
          h1: (props) => <h3 {...props} className="text-lg font-semibold" />,
          h2: (props) => <h4 {...props} className="text-base font-semibold" />,
          h3: (props) => <h5 {...props} className="text-sm font-semibold" />,
          ul: (props) => <ul {...props} className="list-disc pl-5" />,
          ol: (props) => <ol {...props} className="list-decimal pl-5" />,
          p: (props) => <p {...props} className="leading-6" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
