import Link from "next/link";
import {
  BookOpen,
  Cpu,
  Lightbulb,
  MessageSquare,
  FileText,
  Network,
  History,
  Layers,
} from "lucide-react";
import { stats } from "@/lib/kg/browse";

const LINKS = [
  { href: "/wiki", label: "Overview", icon: Layers, key: "overview" },
  { href: "/wiki/entities", label: "Entities", icon: Cpu, key: "entities" },
  { href: "/wiki/concepts", label: "Concepts", icon: Lightbulb, key: "concepts" },
  {
    href: "/wiki/observations",
    label: "Observations",
    icon: MessageSquare,
    key: "observations",
  },
  { href: "/wiki/reports", label: "Reports", icon: FileText, key: "reports" },
  { href: "/wiki/sources", label: "Sources", icon: BookOpen, key: "sources" },
  { href: "/wiki/graph", label: "Graph", icon: Network, key: "graph" },
  { href: "/wiki/log", label: "Activity", icon: History, key: "logs" },
] as const;

export default async function WikiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let s: Record<string, number> = {};
  try {
    s = (await stats()) as unknown as Record<string, number>;
  } catch {
    s = {};
  }
  return (
    <div className="mx-auto flex max-w-[1400px] gap-6 px-6 py-6">
      <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-56 shrink-0 lg:block">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Knowledge
          </div>
          <div className="text-sm font-semibold">Quality wiki</div>
        </div>
        <nav className="space-y-1">
          {LINKS.map((l) => {
            const Icon = l.icon;
            const count = s[l.key];
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                <Icon className="h-4 w-4 text-zinc-500" />
                <span className="flex-1">{l.label}</span>
                {typeof count === "number" ? (
                  <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 rounded-md border border-dashed border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">
          <div className="mb-1 font-medium text-zinc-700 dark:text-zinc-300">
            How this works
          </div>
          The wiki is a Kuzu property graph the co-pilot maintains. Finished
          reports, observations, and entities accumulate here. Every write
          appends to <code>wiki/events.jsonl</code>.
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
