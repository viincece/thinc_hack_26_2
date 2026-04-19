"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Factory,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ArticleSummary } from "@/lib/fmea/types";

/**
 * Modal for starting an FMEA draft. Lists articles with their 6-month
 * defect counts so the quality engineer immediately sees which product
 * families are "hot". Sorted by defects descending on open; the search
 * box narrows by id / name / commodity substring.
 *
 * UX decisions:
 *   - Default sort = activity, because that's the realistic selection
 *     heuristic (the engineer almost always wants to FMEA the article
 *     that's been misbehaving lately).
 *   - Each row has a coloured bar on the left keyed to its defect
 *     count band (green / amber / red) so the picker doubles as a
 *     fleet heat-map.
 *   - Keyboard: `/` focuses search, Enter on a focused row generates.
 */
export function NewFmeaButton({
  variant = "default",
  size = "sm",
  label = "New FMEA draft",
  className,
}: {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        {label}
      </Button>
      {open ? <NewFmeaDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function NewFmeaDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const r = await fetch("/api/fmea/articles", { cache: "no-store" });
        if (!r.ok) throw new Error(`articles ${r.status}`);
        const body = (await r.json()) as { articles: ArticleSummary[] };
        if (!aborted) setArticles(body.articles ?? []);
      } catch (e) {
        if (!aborted) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  // Close on ESC, "/" focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!articles) return [];
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) =>
      [a.article_id, a.article_name, a.commodity]
        .filter((s): s is string => !!s)
        .some((s) => s.toLowerCase().includes(q)),
    );
  }, [articles, query]);

  const totalDefects6mo = useMemo(
    () => (articles ?? []).reduce((n, a) => n + (a.defects6mo ?? 0), 0),
    [articles],
  );

  const generate = useCallback(
    async (articleId: string) => {
      if (generatingFor) return;
      setGeneratingFor(articleId);
      setErr(null);
      try {
        const r = await fetch("/api/fmea/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId }),
        });
        const body = (await r.json()) as { id?: string; error?: string };
        if (!r.ok || !body.id) throw new Error(body.error ?? `generate ${r.status}`);
        // Notify workspace rails so the new draft appears immediately.
        window.dispatchEvent(new Event("s3:workspace-changed"));
        router.push(`/report/fmea/${body.id}`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setGeneratingFor(null);
      }
    },
    [router, generatingFor],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Start a new FMEA"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-sage-border bg-parchment shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-sage-border px-4 py-3">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
              <ShieldAlert className="h-3 w-3" />
              FMEA draft · generator
            </div>
            <h2 className="mt-0.5 text-lg font-bold text-deep-olive">
              Pick an article to FMEA
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-muted-olive">
              The co-pilot walks the BOM, pulls 6 months of defects + claims +
              test coverage, scores S·O·D per row, and saves a draft under
              <code className="mx-1 rounded bg-sage-cream px-1 text-[10px]">
                /public/fmea-drafts
              </code>{" "}
              — <span className="font-mono">{totalDefects6mo}</span> defects
              across the fleet in the last 6 months.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-olive hover:bg-hover-bg hover:text-brand-orange"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-sage-border/70 px-4 py-2">
          <label className="flex items-center gap-2 rounded-md border border-sage-border bg-white px-2 py-1">
            <Search className="h-3.5 w-3.5 text-muted-olive" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search article id, name, commodity… (press / to focus)"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-olive"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-[10px] text-muted-olive hover:text-brand-orange"
              >
                clear
              </button>
            ) : null}
          </label>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-olive">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading articles…
            </div>
          ) : err ? (
            <div className="m-2 rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">
              {err}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm italic text-muted-olive">
              No articles match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((a) => (
                <ArticleRow
                  key={a.article_id}
                  a={a}
                  generating={generatingFor === a.article_id}
                  disabled={!!generatingFor && generatingFor !== a.article_id}
                  onGenerate={() => void generate(a.article_id)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-sage-border px-4 py-2 text-[11px] text-muted-olive">
          <span>
            Esc to close · <kbd className="rounded bg-sage-cream px-1">/</kbd> to
            search · Enter on a row to generate.
          </span>
          <span>Sorted by activity in the last 6 months</span>
        </div>
      </div>
    </div>
  );
}

function ArticleRow({
  a,
  generating,
  disabled,
  onGenerate,
}: {
  a: ArticleSummary;
  generating: boolean;
  disabled: boolean;
  onGenerate: () => void;
}) {
  const band =
    a.defects6mo >= 30
      ? {
          bar: "bg-red-500",
          badge: "bg-red-100 text-red-800 ring-red-200",
          label: "hot",
        }
      : a.defects6mo >= 10
        ? {
            bar: "bg-amber-500",
            badge: "bg-amber-100 text-amber-800 ring-amber-200",
            label: "watch",
          }
        : a.defects6mo > 0
          ? {
              bar: "bg-emerald-500",
              badge: "bg-emerald-100 text-emerald-800 ring-emerald-200",
              label: "normal",
            }
          : {
              bar: "bg-zinc-300",
              badge: "bg-zinc-100 text-zinc-600 ring-zinc-200",
              label: "quiet",
            };

  const lastSeen = a.lastDefectAt
    ? new Date(a.lastDefectAt).toLocaleDateString()
    : null;

  return (
    <li>
      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled}
        className={cn(
          "group flex w-full items-stretch gap-3 rounded-md border bg-white/80 text-left transition-colors",
          disabled
            ? "cursor-not-allowed border-sage-border/70 opacity-60"
            : "border-sage-border hover:border-light-border hover:bg-white",
        )}
      >
        <div className={cn("w-1.5 shrink-0 rounded-l-md", band.bar)} />
        <div className="min-w-0 flex-1 py-1.5 pr-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-olive">
              {a.article_id}
            </span>
            <span
              className={cn(
                "rounded-sm px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset",
                band.badge,
              )}
              title={`${a.defects6mo} defects in last 6 months`}
            >
              {band.label}
            </span>
            <span className="truncate text-sm font-semibold text-deep-olive">
              {a.article_name ?? "—"}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-olive">
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {a.defects6mo} defects (6&nbsp;mo)
            </span>
            {a.criticalDefects6mo > 0 ? (
              <span className="inline-flex items-center gap-1 text-red-700">
                <ShieldAlert className="h-3 w-3" />
                {a.criticalDefects6mo} critical
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Factory className="h-3 w-3" />
              {a.bomSize} BOM
            </span>
            {a.commodity ? (
              <span className="rounded-sm bg-sage-cream px-1 text-[10px] uppercase text-muted-olive ring-1 ring-inset ring-sage-border">
                {a.commodity}
              </span>
            ) : null}
            {lastSeen ? <span>last defect {lastSeen}</span> : null}
          </div>
        </div>
        <div className="flex w-28 shrink-0 items-center justify-center border-l border-sage-border/70 bg-sage-cream/60 text-[11px] font-semibold uppercase tracking-wider text-muted-olive transition-colors group-hover:bg-emerald-600 group-hover:text-white">
          {generating ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              generating
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              generate
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
