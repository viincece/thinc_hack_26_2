"use client";

import { AlertTriangle, Box, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { BomTreeNode } from "@/lib/reports/types";

const HIGHLIGHT_STYLE: Record<string, string> = {
  root_cause: "border-red-400 bg-red-50 dark:bg-red-950/30 dark:border-red-800",
  watch: "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800",
  default: "border-zinc-200 bg-white dark:bg-zinc-950 dark:border-zinc-800",
};

export function BomTreeView({ root }: { root: BomTreeNode }) {
  return (
    <ul className="space-y-1">
      <TreeRow node={root} depth={0} />
    </ul>
  );
}

function TreeRow({ node, depth }: { node: BomTreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = (node.children ?? []).length > 0;
  const style =
    HIGHLIGHT_STYLE[node.highlight ?? "default"] ?? HIGHLIGHT_STYLE.default;
  const icon =
    depth === 0 ? (
      <Layers className="h-3.5 w-3.5 text-zinc-500" />
    ) : (
      <Box className="h-3.5 w-3.5 text-zinc-400" />
    );

  return (
    <li>
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm",
          style,
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!hasChildren}
          className="mt-0.5 shrink-0 opacity-70 disabled:opacity-20"
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
        {icon}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold">
              {node.find_number ?? ""}
            </span>
            <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">
              {node.part_number ?? node.label}
            </span>
            {node.highlight === "root_cause" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-1.5 text-[9px] font-semibold uppercase text-white">
                <AlertTriangle className="h-2.5 w-2.5" /> suspect
              </span>
            ) : node.highlight === "watch" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-1.5 text-[9px] font-semibold uppercase text-white">
                watch
              </span>
            ) : null}
            {typeof node.defects_count === "number" && node.defects_count > 0 ? (
              <span className="rounded-full bg-zinc-900 px-1.5 text-[9px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                {node.defects_count} defects
              </span>
            ) : null}
          </div>
          {node.supplier_name || node.supplier_batch_id ? (
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {node.supplier_name ?? "—"}
              {node.supplier_batch_id ? ` · batch ${node.supplier_batch_id}` : ""}
            </div>
          ) : null}
        </div>
      </div>
      {hasChildren && open ? (
        <ul className="ml-4 mt-1 space-y-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
          {node.children!.map((c) => (
            <TreeRow key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
