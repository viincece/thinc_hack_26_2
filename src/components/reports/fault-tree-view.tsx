"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FaultNode } from "@/lib/reports/types";

const KIND_STYLE: Record<FaultNode["kind"], string> = {
  defect: "bg-red-50 border-red-300 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200",
  category: "bg-violet-50 border-violet-300 text-violet-900 dark:bg-violet-950/30 dark:border-violet-900 dark:text-violet-200",
  concept: "bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-200",
  evidence: "bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300",
};

const CONFIDENCE_PILL: Record<string, string> = {
  high: "bg-emerald-600 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-zinc-400 text-white",
};

export function FaultTreeView({ root }: { root: FaultNode }) {
  return (
    <ul className="space-y-1 text-sm">
      <TreeBranch node={root} depth={0} />
    </ul>
  );
}

function TreeBranch({ node, depth }: { node: FaultNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = (node.children ?? []).length > 0;

  return (
    <li>
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border px-2 py-1.5",
          KIND_STYLE[node.kind],
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!hasChildren}
          className="mt-0.5 shrink-0 opacity-70 disabled:opacity-20"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="block h-3.5 w-3.5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
              {node.kind}
            </span>
            {node.confidence ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[9px] font-semibold uppercase",
                  CONFIDENCE_PILL[node.confidence] ?? CONFIDENCE_PILL.low,
                )}
              >
                {node.confidence}
              </span>
            ) : null}
          </div>
          <div className="text-sm font-medium leading-tight">{node.label}</div>
          {node.detail ? (
            <div className="mt-0.5 text-[11px] opacity-80">{node.detail}</div>
          ) : null}
        </div>
      </div>
      {hasChildren && open ? (
        <ul className="ml-4 mt-1 space-y-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
          {node.children!.map((c) => (
            <TreeBranch key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
