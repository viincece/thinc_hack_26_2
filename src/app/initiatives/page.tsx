import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  CircleX,
  FileText,
  Loader2,
} from "lucide-react";
import { manex, type ProductActionRow } from "@/lib/manex";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildDraftsIndex, type DraftRef } from "@/lib/drafts-index";

export const dynamic = "force-dynamic";

type Status = ProductActionRow["status"];
type CoverageFilter = "all" | "covered" | "uncovered";

/**
 * One swim-lane of the Kanban. Colour accents are deliberately
 * restrained — the goal is "which column needs attention" at a glance,
 * not a carnival.
 */
const COLUMNS: Array<{
  key: Status;
  title: string;
  hint: string;
  tint: string;
  barColour: string;
  icon: typeof AlertCircle;
}> = [
  {
    key: "open",
    title: "Open",
    hint: "Flagged, not started",
    tint: "bg-amber-50/60",
    barColour: "bg-amber-500",
    icon: AlertCircle,
  },
  {
    key: "in_progress",
    title: "In progress",
    hint: "Someone is on it",
    tint: "bg-sky-50/60",
    barColour: "bg-sky-500",
    icon: Loader2,
  },
  {
    key: "done",
    title: "Done",
    hint: "Closed, verified",
    tint: "bg-emerald-50/60",
    barColour: "bg-emerald-500",
    icon: CheckCircle2,
  },
  {
    key: "cancelled",
    title: "Cancelled",
    hint: "Dropped or duplicate",
    tint: "bg-zinc-50/60",
    barColour: "bg-zinc-400",
    icon: CircleX,
  },
];

async function load(): Promise<ProductActionRow[]> {
  try {
    return await manex<ProductActionRow[]>("/product_action", {
      order: "ts.desc",
      limit: 300,
    });
  } catch {
    return [];
  }
}

function parseCoverage(raw: string | string[] | undefined): CoverageFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "covered" || v === "uncovered" ? v : "all";
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Lookup: has this initiative been picked up as a report or draft?
 * We combine action-anchored hits (the draft explicitly names this
 * ACT-id) with defect-anchored hits (the action's defect_id shows up
 * in a draft), because engineers typically cite the defect, not the
 * action.
 */
function coverageFor(
  action: ProductActionRow,
  byDefect: Map<string, DraftRef[]>,
  byAction: Map<string, DraftRef[]>,
): DraftRef[] {
  const collected: DraftRef[] = [];
  const seen = new Set<string>();
  const add = (refs: DraftRef[] | undefined) => {
    if (!refs) return;
    for (const r of refs) {
      const key = `${r.kind}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(r);
    }
  };
  add(byAction.get(action.action_id));
  if (action.defect_id) add(byDefect.get(action.defect_id));
  return collected;
}

/**
 * Coloured coverage chip for a single attached draft/analysis.
 * Prop is `draft`, not `ref` — `ref` is a reserved React prop name
 * that gets intercepted as an element ref rather than a value.
 */
function CoverageChip({ draft }: { draft: DraftRef }) {
  const is8D = draft.kind === "8D";
  const Icon = is8D ? ClipboardCheck : FileText;
  return (
    <Link
      href={draft.href}
      title={`${draft.name} · created ${formatStamp(draft.createdAt)}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors",
        is8D
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100"
          : "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100",
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="font-mono">{draft.id}</span>
    </Link>
  );
}

/** Segmented control filter — ?cover=all|covered|uncovered. */
function CoverageTabs({
  current,
  counts,
}: {
  current: CoverageFilter;
  counts: { all: number; covered: number; uncovered: number };
}) {
  const tabs: Array<{ key: CoverageFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "covered", label: "With draft", count: counts.covered },
    { key: "uncovered", label: "Needs draft", count: counts.uncovered },
  ];
  return (
    <div
      role="tablist"
      aria-label="Coverage filter"
      className="inline-flex items-center gap-0.5 rounded-md border border-sage-border bg-parchment p-0.5 text-[11px]"
    >
      {tabs.map((t) => {
        const active = current === t.key;
        const qs = t.key === "all" ? "" : `?cover=${t.key}`;
        return (
          <Link
            key={t.key}
            href={`/initiatives${qs}`}
            scroll={false}
            role="tab"
            aria-selected={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2 py-1 font-medium transition-colors",
              active
                ? "bg-sage-cream text-deep-olive shadow-sm ring-1 ring-inset ring-sage-border"
                : "text-muted-olive hover:bg-sage-cream/60 hover:text-deep-olive",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded px-1 text-[10px] font-semibold",
                active
                  ? "bg-white/80 text-deep-olive"
                  : "bg-sage-cream/50 text-muted-olive",
              )}
            >
              {t.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** One card in a column. */
function ActionCard({
  row,
  coverage,
}: {
  row: ProductActionRow;
  coverage: DraftRef[];
}) {
  const hasCoverage = coverage.length > 0;
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-2.5 text-xs shadow-sm transition-colors hover:border-sage-border hover:shadow dark:border-zinc-800 dark:bg-zinc-950">
      {/* Line 1: action id + type pill. */}
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-[11px] font-semibold text-deep-olive">
          {row.action_id}
        </div>
        <span className="shrink-0 rounded bg-sage-cream px-1.5 py-0.5 text-[10px] font-medium text-muted-olive ring-1 ring-inset ring-sage-border">
          {row.action_type}
        </span>
      </div>
      {/* Line 2: when · who. */}
      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-olive">
        <span>{formatStamp(row.ts)}</span>
        <span className="text-zinc-300">·</span>
        <span>{row.user_id}</span>
      </div>
      {/* Defect link + severity (if any). */}
      {row.defect_id ? (
        <div className="mt-1.5">
          <Link
            href={`/incidents/${row.defect_id}`}
            className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            title="Open the defect this initiative was created for"
          >
            {row.defect_id}
          </Link>
        </div>
      ) : null}
      {/* Body: comments. */}
      {row.comments ? (
        <div className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
          {row.comments}
        </div>
      ) : null}
      {/* Coverage footer: chips for every attached draft / analysis. */}
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
        {hasCoverage ? (
          coverage.map((r) => (
            <CoverageChip key={`${r.kind}:${r.id}`} draft={r} />
          ))
        ) : (
          <Badge
            variant="outline"
            className="rounded-sm border-zinc-300 bg-transparent text-[10px] font-normal text-zinc-500"
          >
            no draft yet
          </Badge>
        )}
      </div>
    </div>
  );
}

export default async function InitiativesPage({
  searchParams,
}: {
  // Next 15+: searchParams is a promise.
  searchParams?: Promise<{ cover?: string | string[] }>;
}) {
  const sp = (await searchParams) ?? {};
  const cover = parseCoverage(sp.cover);

  const [rows, draftsIndex] = await Promise.all([
    load(),
    buildDraftsIndex(),
  ]);

  // Compute per-row coverage once so both the filter-count header and the
  // render pass don't each walk the drafts index.
  const rowsWithCoverage = rows.map((r) => ({
    row: r,
    coverage: coverageFor(r, draftsIndex.byDefect, draftsIndex.byAction),
  }));
  const counts = {
    all: rowsWithCoverage.length,
    covered: rowsWithCoverage.filter((r) => r.coverage.length > 0).length,
    uncovered: rowsWithCoverage.filter((r) => r.coverage.length === 0).length,
  };

  const visible =
    cover === "all"
      ? rowsWithCoverage
      : cover === "covered"
        ? rowsWithCoverage.filter((r) => r.coverage.length > 0)
        : rowsWithCoverage.filter((r) => r.coverage.length === 0);

  const byStatus = visible.reduce<
    Record<Status, Array<(typeof rowsWithCoverage)[number]>>
  >(
    (acc, r) => {
      (acc[r.row.status] ??= []).push(r);
      return acc;
    },
    { open: [], in_progress: [], done: [], cancelled: [] },
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Initiatives</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Corrective actions from <code>product_action</code>, grouped by
            status. A green chip means an 8D draft is tracking this action;
            amber means an incident analysis has been generated.
          </p>
        </div>
        <CoverageTabs current={cover} counts={counts} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const bucket = byStatus[col.key] ?? [];
          const Icon = col.icon;
          return (
            <Card
              key={col.key}
              className={cn(
                "flex h-full flex-col overflow-hidden",
                col.tint,
              )}
            >
              {/* Coloured accent bar so a glance resolves the column. */}
              <div className={cn("h-1 w-full", col.barColour)} aria-hidden />
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Icon
                    className={cn(
                      "h-4 w-4 text-muted-olive",
                      col.key === "in_progress" && "animate-[spin_4s_linear_infinite]",
                    )}
                    aria-hidden
                  />
                  {col.title}
                  <span className="ml-auto rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-muted-olive ring-1 ring-inset ring-sage-border">
                    {bucket.length}
                  </span>
                </CardTitle>
                <CardDescription className="text-[11px]">
                  {col.hint}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                {bucket.length === 0 ? (
                  <div className="rounded-md border border-dashed border-zinc-200 p-4 text-center text-[11px] text-zinc-500 dark:border-zinc-800">
                    {cover === "covered"
                      ? "No initiatives with drafts."
                      : cover === "uncovered"
                        ? "Every initiative here is tracked."
                        : "Empty"}
                  </div>
                ) : (
                  bucket.map(({ row, coverage }) => (
                    <ActionCard
                      key={row.action_id}
                      row={row}
                      coverage={coverage}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
