"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DraftSummary = {
  id: string;
  name: string;
  date: string;
  filename: string;
  updatedAt: string;
  problemPreview: string;
  articleName?: string;
  sizeBytes: number;
};

export function NewAnalysisButton({
  className,
  size = "default",
  variant = "default",
  label = "New incidence analysis",
  showIcon = true,
}: {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "subtle";
  label?: string;
  showIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
        title="Generate a new incident analysis from a saved 8D draft"
      >
        {showIcon ? <Sparkles className="h-4 w-4" /> : null}
        {label}
      </Button>
      {open ? <NewAnalysisDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function NewAnalysisDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load drafts on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/drafts", { cache: "no-store" });
        if (!r.ok) throw new Error(`list ${r.status}`);
        const body = (await r.json()) as { drafts: DraftSummary[] };
        if (!cancelled) setDrafts(body.drafts ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const generate = useCallback(async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: selected }),
      });
      const body = await r.json();
      if (!r.ok || !body?.id) throw new Error(body?.error ?? `generate ${r.status}`);
      // Notify workspace rails so they show the new analysis immediately.
      window.dispatchEvent(new Event("s3:workspace-changed"));
      router.push(`/reports/${body.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, [selected, busy, router]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-0 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <div className="text-sm font-semibold">New incidence analysis</div>
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">
              Pick a saved 8D draft. The analysis is generated from Manex +
              knowledge graph and saved to <code>/public/reports</code>.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3">
          {drafts === null && !error ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading drafts…
            </div>
          ) : drafts && drafts.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-1.5">
              {(drafts ?? []).map((d) => {
                const active = d.id === selected;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(d.id)}
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="truncate text-sm font-medium">
                          {d.name}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-zinc-500">
                          {d.id}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {d.date}
                        {d.articleName ? ` · ${d.articleName}` : ""}
                      </div>
                      {d.problemPreview ? (
                        <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">
                          {d.problemPreview}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {error ? (
            <div className="flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </div>
          ) : (
            <span className="text-xs text-zinc-400">
              {selected ? "Ready to generate." : "Select a draft to continue."}
            </span>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={generate} disabled={!selected || busy}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Generate analysis
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
      <div className="font-medium text-zinc-700 dark:text-zinc-200">
        No saved 8D drafts yet.
      </div>
      <div className="mt-1 text-xs">
        Start an 8D from <code>/report/new</code>, hit <b>Save</b>, then come
        back here.
      </div>
    </div>
  );
}
