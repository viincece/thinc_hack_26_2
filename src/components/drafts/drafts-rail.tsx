"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FilePlus,
  Loader2,
  RefreshCw,
  Settings,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DRAFT_KINDS, type DraftKind } from "@/lib/drafts-kinds";
import { DraftKindChip, draftKindMeta } from "./kind-chip";
import { NewItemMenu } from "@/components/workspace/new-item-menu";

const COLLAPSED_KEY = "s3:drafts-rail-collapsed";
const FILTER_KEY = "s3:drafts-rail-filter";

/**
 * Workspace drafts rail. Rendered in the root layout on every page except
 * /report/new (which has its own rich sidepanel). Lets the user jump
 * straight to any saved draft — a click on a row deep-links to
 * /report/new?draft=<id> and the workspace auto-loads it on arrival.
 *
 * UX features:
 *   - Collapsible (persisted to localStorage)
 *   - Kind-filter pills above the draft list (8D / FMEA / Analysis)
 *   - Profile + Settings mock-up buttons at the bottom-left
 */
type Summary = {
  id: string;
  name: string;
  date: string;
  kind: DraftKind;
  updatedAt: string;
  problemPreview?: string;
  articleName?: string;
};

export function DraftsRail() {
  const pathname = usePathname();
  const suppressed = pathname?.startsWith("/report/new");

  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [drafts, setDrafts] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeKinds, setActiveKinds] = useState<Set<DraftKind>>(
    () => new Set(DRAFT_KINDS),
  );
  const seq = useRef(0);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
      const raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const valid = parsed.filter((k): k is DraftKind =>
          (DRAFT_KINDS as readonly string[]).includes(k),
        );
        if (valid.length > 0) setActiveKinds(new Set(valid));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const [draftsRes, reportsRes, fmeaRes] = await Promise.all([
        fetch("/api/drafts", { cache: "no-store" }),
        fetch("/api/reports", { cache: "no-store" }),
        fetch("/api/fmea", { cache: "no-store" }),
      ]);
      const drafted = draftsRes.ok
        ? ((await draftsRes.json()) as { drafts: Summary[] }).drafts ?? []
        : [];
      type ReportSummary = {
        id: string;
        name: string;
        generatedAt: string;
        articleName?: string;
        defectCode?: string;
      };
      const reports = reportsRes.ok
        ? ((await reportsRes.json()) as { reports: ReportSummary[] }).reports ?? []
        : [];
      const analyses: Summary[] = reports.map((r) => ({
        id: r.id,
        name: r.name,
        date: r.generatedAt.slice(0, 10),
        kind: "Analysis",
        updatedAt: r.generatedAt,
        problemPreview: [r.defectCode, r.articleName].filter(Boolean).join(" · "),
        articleName: r.articleName,
      }));
      type FmeaSum = {
        id: string;
        name: string;
        articleId: string;
        articleName?: string;
        rowCount: number;
        maxRpn: number;
        generatedAt: string;
      };
      const fmeas = fmeaRes.ok
        ? ((await fmeaRes.json()) as { fmeas: FmeaSum[] }).fmeas ?? []
        : [];
      const fmeaItems: Summary[] = fmeas.map((f) => ({
        id: f.id,
        name: f.name,
        date: f.generatedAt.slice(0, 10),
        kind: "FMEA",
        updatedAt: f.generatedAt,
        problemPreview: `${f.rowCount} rows · top RPN ${f.maxRpn}`,
        articleName: f.articleName,
      }));
      const merged = [...drafted, ...analyses, ...fmeaItems].sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : -1,
      );
      if (seq.current === my) setDrafts(merged);
    } catch {
      /* ignore */
    } finally {
      if (seq.current === my) setLoading(false);
    }
  }, []);

  // Cross-component refresh — listen for generate/save events.
  useEffect(() => {
    const onExt = () => void refresh();
    window.addEventListener("s3:workspace-changed", onExt);
    return () => window.removeEventListener("s3:workspace-changed", onExt);
  }, [refresh]);

  useEffect(() => {
    if (suppressed) return;
    void refresh();
  }, [refresh, suppressed, pathname]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleKind = useCallback((k: DraftKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      // Never persist an "everything off" state — that's equivalent to
      // showing all drafts, so revert to the full set.
      const normalised = next.size === 0 ? new Set<DraftKind>(DRAFT_KINDS) : next;
      try {
        localStorage.setItem(
          FILTER_KEY,
          JSON.stringify([...normalised]),
        );
      } catch {
        /* ignore */
      }
      return normalised;
    });
  }, []);

  const kindCounts = useMemo(() => {
    const counts: Record<DraftKind, number> = {
      "8D": 0,
      FMEA: 0,
      Analysis: 0,
    };
    for (const d of drafts) counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    return counts;
  }, [drafts]);

  const visibleDrafts = useMemo(
    () => drafts.filter((d) => activeKinds.has(d.kind)),
    [drafts, activeKinds],
  );

  const effectiveCollapsed = hydrated ? collapsed : true;

  if (suppressed) return null;

  if (effectiveCollapsed) {
    return (
      <aside
        className={cn(
          "sticky top-14 z-10 hidden h-[calc(100vh-3.5rem)] w-11 shrink-0",
          "border-r border-sage-border bg-parchment/80 backdrop-blur md:flex",
          "flex-col items-center gap-1 py-2",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          title="Expand drafts"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-olive hover:bg-hover-bg hover:text-brand-orange"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <Link
          href="/report/new"
          title="Quick start: new 8D (use the expanded rail for FMEA / analysis)"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-olive hover:bg-hover-bg hover:text-brand-orange"
        >
          <FilePlus className="h-4 w-4" />
        </Link>
        <div className="my-1 h-px w-5 bg-sage-border" />
        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {visibleDrafts.slice(0, 14).map((d) => {
            const meta = draftKindMeta(d.kind);
            const Icon = meta.icon;
            const href =
              d.kind === "Analysis"
                ? `/reports/${encodeURIComponent(d.id)}`
                : d.kind === "FMEA"
                  ? `/report/fmea/${encodeURIComponent(d.id)}`
                  : `/report/new?draft=${encodeURIComponent(d.id)}`;
            return (
              <Link
                key={d.id}
                href={href}
                title={`${d.kind} · ${d.name}`}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-olive ring-1 ring-inset ring-transparent hover:ring-sage-border"
              >
                <Icon className="h-3.5 w-3.5" />
              </Link>
            );
          })}
        </div>
        <div className="mt-auto flex flex-col items-center gap-1 pb-1">
          <ProfileButton compact />
          <SettingsButton compact />
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "sticky top-14 z-10 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-hidden",
        "border-r border-sage-border bg-parchment/95 backdrop-blur md:flex md:flex-col",
      )}
    >
      <div className="flex items-center justify-between border-b border-sage-border/70 px-3 py-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
            Workspace
          </div>
          <div className="text-sm font-bold text-deep-olive">Your drafts</div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void refresh()}
            title="Refresh"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-olive hover:bg-hover-bg hover:text-brand-orange"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={toggle}
            title="Collapse"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-olive hover:bg-hover-bg hover:text-brand-orange"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-sage-border/70 p-2">
        <NewItemMenu variant="outline" size="sm" className="w-full" />
      </div>

      {/* Kind filters */}
      <div className="border-b border-sage-border/70 px-2 py-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
            Filter by kind
          </span>
          {activeKinds.size < DRAFT_KINDS.length ? (
            <button
              type="button"
              onClick={() => {
                setActiveKinds(new Set(DRAFT_KINDS));
                try {
                  localStorage.setItem(
                    FILTER_KEY,
                    JSON.stringify(DRAFT_KINDS),
                  );
                } catch {
                  /* ignore */
                }
              }}
              className="text-[10px] font-medium text-muted-olive hover:text-brand-orange"
            >
              all
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {DRAFT_KINDS.map((k) => {
            const meta = draftKindMeta(k);
            const Icon = meta.icon;
            const on = activeKinds.has(k);
            const count = kindCounts[k] ?? 0;
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ring-1 ring-inset",
                  on
                    ? meta.cls
                    : "bg-parchment text-sage ring-sage-border/60 hover:ring-light-border",
                )}
                title={
                  on
                    ? `Hide ${meta.label} drafts`
                    : `Show ${meta.label} drafts`
                }
              >
                <Icon className="h-3 w-3" />
                {meta.label}
                <span
                  className={cn(
                    "rounded-sm px-1 text-[9px] font-bold",
                    on ? "bg-white/60" : "bg-sage-cream",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {drafts.length === 0 ? (
          <div className="rounded-md border border-dashed border-sage-border p-3 text-[11px] leading-snug text-muted-olive">
            No saved drafts yet. Start a report from any incident to create one.
          </div>
        ) : visibleDrafts.length === 0 ? (
          <div className="rounded-md border border-dashed border-sage-border p-3 text-[11px] leading-snug text-muted-olive">
            No drafts match the current filter.
          </div>
        ) : (
          <ul className="space-y-1">
            {visibleDrafts.map((d) => (
              <li key={d.id}>
                <Link
                  href={
                    d.kind === "Analysis"
                      ? `/reports/${encodeURIComponent(d.id)}`
                      : d.kind === "FMEA"
                        ? `/report/fmea/${encodeURIComponent(d.id)}`
                        : `/report/new?draft=${encodeURIComponent(d.id)}`
                  }
                  className={cn(
                    "group block rounded-md border border-sage-border/70 bg-white/60 px-2 py-1.5 transition-colors",
                    "hover:border-light-border hover:bg-white",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <DraftKindChip kind={d.kind} size="xs" />
                    <span className="truncate text-[12px] font-semibold text-deep-olive">
                      {d.name}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-olive">
                    {d.id} · {d.date}
                  </div>
                  {d.problemPreview ? (
                    <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-olive">
                      {d.problemPreview}
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Profile + Settings (mock-up) + counts footer */}
      <div className="border-t border-sage-border/70 bg-parchment/80">
        <div className="flex items-center gap-1 px-2 py-1.5">
          <ProfileButton />
          <SettingsButton />
          <div className="ml-auto text-[10px] text-sage">
            {visibleDrafts.length}
            {visibleDrafts.length !== drafts.length ? ` / ${drafts.length}` : ""}
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Profile + Settings — visual mock-ups. No real auth / config yet, so
    both show a small toast-style tooltip on click explaining the state.    */
/* ──────────────────────────────────────────────────────────────────────── */

function ProfileButton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <button
        type="button"
        title="Profile — coming soon"
        onClick={() => alertSoon("Profile")}
        className="flex h-7 w-7 items-center justify-center rounded-md bg-cta-dark text-parchment hover:opacity-80"
      >
        <UserRound className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => alertSoon("Profile")}
      title="Profile — coming soon"
      className="flex items-center gap-1.5 rounded-md border border-sage-border bg-white/70 px-2 py-1 text-[11px] font-semibold text-deep-olive transition-colors hover:border-light-border hover:text-brand-orange"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cta-dark text-parchment">
        <UserRound className="h-3 w-3" />
      </span>
      team_vitruvius
    </button>
  );
}

function SettingsButton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <button
        type="button"
        title="Settings — coming soon"
        onClick={() => alertSoon("Settings")}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-sage-border bg-parchment text-muted-olive hover:text-brand-orange"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => alertSoon("Settings")}
      title="Settings — coming soon"
      className="flex h-7 w-7 items-center justify-center rounded-md border border-sage-border bg-white/70 text-muted-olive transition-colors hover:border-light-border hover:text-brand-orange"
    >
      <Settings className="h-3.5 w-3.5" />
    </button>
  );
}

function alertSoon(area: string) {
  // Tiny non-blocking hint — the real panels land later.
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-alert
    window.alert(`${area} panel coming soon — this is a mock-up entry point.`);
  }
}
