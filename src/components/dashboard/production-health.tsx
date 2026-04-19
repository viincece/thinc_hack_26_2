"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Euro,
  Factory,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ArticleHealth,
  ProductionSummary,
  SupplierHealth,
} from "@/lib/dashboard/production-summary";

/** Inline here so this client component doesn't drag `pg` into the
 *  browser bundle via the server-only production-summary module. */
function pct(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

/**
 * "Production & quality health" panel — bottom strip of the dashboard.
 *
 * Three blocks, in descending order of granularity:
 *
 *  1. Headline KPIs — total units, total defects, total claims, total
 *     cost — framed so the viewer immediately sees whether "this
 *     quarter was cheap or expensive".
 *
 *  2. Per-article grid — one card per product family. Colour of the
 *     defect-rate bar signals how much of the production line is
 *     touched by issues. Clicking an article row would drill into a
 *     per-article view (future work).
 *
 *  3. Supplier scorecard — ranked by defect count tied to their
 *     parts, with a "defects per 1k products" density metric that's
 *     fairer than raw counts when one supplier is in everything.
 *
 *  4. Test mix donut — first-pass rate at the tail so the engineer
 *     sees the leading indicator next to the trailing ones.
 */

const BAND_GREEN = "#10b981"; // emerald-500
const BAND_AMBER = "#f59e0b"; // amber-500
const BAND_RED = "#dc2626"; // red-600
const BAND_GREY = "#d4d4d8"; // zinc-300

export function ProductionHealthCard({
  summary,
}: {
  summary: ProductionSummary;
}) {
  if (summary.totalUnitsBuilt === 0 && summary.articles.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-sage-border p-6 text-center text-sm text-muted-olive">
        Production summary unavailable — the Manex API didn&apos;t return any
        units built in the last 6 months.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {/* Headline strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <HeadlineTile
          label="Units built (6 mo)"
          value={summary.totalUnitsBuilt.toLocaleString()}
          icon={<Factory className="h-3.5 w-3.5" />}
        />
        <HeadlineTile
          label="In-factory defects"
          value={summary.totalDefectCount.toLocaleString()}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          tone={
            summary.totalDefectCount > summary.totalUnitsBuilt * 0.4
              ? "red"
              : summary.totalDefectCount > summary.totalUnitsBuilt * 0.15
                ? "amber"
                : "green"
          }
        />
        <HeadlineTile
          label="Field claims"
          value={summary.totalClaimCount.toLocaleString()}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone={summary.totalClaimCount > 0 ? "red" : "green"}
        />
        <HeadlineTile
          label="Cost impact"
          value={fmtEur(summary.totalCostEur)}
          icon={<Euro className="h-3.5 w-3.5" />}
          tone={
            summary.totalCostEur > 10_000
              ? "red"
              : summary.totalCostEur > 1_000
                ? "amber"
                : "green"
          }
        />
      </div>

      {/* Two-column: articles (left) + test mix (right) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <ArticlesTable articles={summary.articles} />
        <TestMixTile
          mix={summary.testMix}
          totalFailedTests={summary.testMix.fail}
        />
      </div>

      {/* Supplier scorecard */}
      <SupplierScorecard suppliers={summary.suppliers} />
    </div>
  );
}

/* -------------------------------------------------------------- *
 *  Headline tile
 * -------------------------------------------------------------- */

function HeadlineTile({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "neutral" | "red" | "amber" | "green";
}) {
  const chip =
    tone === "red"
      ? "bg-red-100 text-red-700 ring-red-200"
      : tone === "amber"
        ? "bg-amber-100 text-amber-800 ring-amber-200"
        : tone === "green"
          ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
          : "bg-sage-cream text-muted-olive ring-sage-border";
  return (
    <div className="rounded-md border border-sage-border bg-parchment px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
          {label}
        </span>
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset",
            chip,
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-0.5 text-xl font-extrabold leading-none text-deep-olive">
        {value}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- *
 *  Articles — one card per product family
 * -------------------------------------------------------------- */

function ArticlesTable({ articles }: { articles: ArticleHealth[] }) {
  const maxCost = Math.max(1, ...articles.map((a) => a.totalCostEur));

  return (
    <div className="rounded-md border border-sage-border bg-parchment">
      <div className="flex items-center justify-between gap-3 border-b border-sage-border/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
            <Factory className="h-3 w-3" />
            Articles
          </span>
          <h3 className="truncate text-sm font-bold leading-none tracking-tight text-deep-olive">
            Production &amp; quality by product family
          </h3>
        </div>
        <span className="shrink-0 text-[10px] text-muted-olive">
          6 mo window
        </span>
      </div>

      <div className="px-1 py-1">
        {articles.length === 0 ? (
          <div className="p-4 text-center text-[11px] italic text-muted-olive">
            No article data returned.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {articles.map((a) => (
              <ArticleRow key={a.article_id} a={a} maxCost={maxCost} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ArticleRow({
  a,
  maxCost,
}: {
  a: ArticleHealth;
  maxCost: number;
}) {
  const defectRate = pct(a.unitsWithDefect, a.unitsBuilt);
  const claimRate = pct(a.unitsWithClaim, a.unitsBuilt);

  const defectTone =
    defectRate == null
      ? "text-muted-olive"
      : defectRate > 40
        ? "text-red-700"
        : defectRate > 15
          ? "text-amber-800"
          : "text-emerald-700";
  const defectBar =
    defectRate == null
      ? BAND_GREY
      : defectRate > 40
        ? BAND_RED
        : defectRate > 15
          ? BAND_AMBER
          : BAND_GREEN;

  const costPct = a.totalCostEur > 0 ? (a.totalCostEur / maxCost) * 100 : 0;

  return (
    <li className="grid grid-cols-[1.6fr_80px_120px_120px_120px] items-center gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-sage-cream/60">
      {/* Name */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-olive">
            {a.article_id}
          </span>
          <span className="truncate font-semibold text-deep-olive">
            {a.article_name}
          </span>
        </div>
        <div className="mt-0.5 flex h-1 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full"
            style={{
              width: `${Math.max(2, Math.min(100, costPct))}%`,
              background: BAND_GREY,
            }}
            title={`${fmtEur(a.totalCostEur)} of €${Math.round(maxCost).toLocaleString()} fleet max`}
          />
        </div>
      </div>

      {/* Units built */}
      <div className="text-right">
        <div className="font-mono text-[13px] font-bold text-deep-olive">
          {a.unitsBuilt.toLocaleString()}
        </div>
        <div className="text-[9px] uppercase text-muted-olive">built</div>
      </div>

      {/* Defect rate */}
      <div className="text-right">
        <div className={cn("font-mono text-[13px] font-bold", defectTone)}>
          {defectRate == null ? "—" : `${defectRate}%`}
        </div>
        <div className="text-[9px] uppercase text-muted-olive">
          defect rate · {a.defectCount} events
        </div>
        <div className="mt-0.5 flex h-1 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full"
            style={{
              width: `${Math.min(100, defectRate ?? 0)}%`,
              background: defectBar,
            }}
          />
        </div>
      </div>

      {/* Claim rate */}
      <div className="text-right">
        <div
          className={cn(
            "font-mono text-[13px] font-bold",
            claimRate && claimRate > 0
              ? "text-red-700"
              : "text-emerald-700",
          )}
        >
          {claimRate == null ? "—" : `${claimRate}%`}
        </div>
        <div className="text-[9px] uppercase text-muted-olive">
          claim rate · {a.claimCount}
        </div>
      </div>

      {/* Cost */}
      <div className="text-right">
        <div className="font-mono text-[13px] font-bold text-olive-ink">
          {fmtEur(a.totalCostEur)}
        </div>
        <div className="text-[9px] uppercase text-muted-olive">
          {fmtEur(a.defectCostEur)}f + {fmtEur(a.claimCostEur)}c
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------- *
 *  Supplier scorecard
 * -------------------------------------------------------------- */

function SupplierScorecard({ suppliers }: { suppliers: SupplierHealth[] }) {
  const top = suppliers.filter((s) => s.defectCount > 0).slice(0, 8);
  if (suppliers.length === 0 && top.length === 0) return null;
  const maxDensity = Math.max(1, ...suppliers.map((s) => s.defectPerThousand));

  return (
    <div className="rounded-md border border-sage-border bg-parchment">
      <div className="flex items-center justify-between gap-3 border-b border-sage-border/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
            <Users className="h-3 w-3" />
            Suppliers
          </span>
          <h3 className="truncate text-sm font-bold leading-none tracking-tight text-deep-olive">
            Supplier scorecard · defects per 1 000 products
          </h3>
        </div>
        <span className="shrink-0 text-[10px] text-muted-olive">
          {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="px-1 py-1">
        {top.length === 0 ? (
          <div className="p-4 text-center text-[11px] italic text-muted-olive">
            No supplier-linked defects in the last 6 months.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {top.map((s) => (
              <SupplierRow key={s.supplier_name} s={s} maxDensity={maxDensity} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SupplierRow({
  s,
  maxDensity,
}: {
  s: SupplierHealth;
  maxDensity: number;
}) {
  const widthPct = maxDensity > 0 ? (s.defectPerThousand / maxDensity) * 100 : 0;
  const tone =
    s.defectPerThousand > 150
      ? BAND_RED
      : s.defectPerThousand > 60
        ? BAND_AMBER
        : BAND_GREEN;
  return (
    <li className="grid grid-cols-[1.5fr_70px_90px_80px_1fr] items-center gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-sage-cream/60">
      <div className="min-w-0 truncate font-semibold text-deep-olive">
        {s.supplier_name}
      </div>
      <div className="text-right font-mono text-[11px] text-muted-olive">
        {s.batches} batch{s.batches === 1 ? "" : "es"}
      </div>
      <div className="text-right font-mono text-[11px] text-muted-olive">
        {s.productsAffected.toLocaleString()} prod
      </div>
      <div className="text-right font-mono text-[13px] font-bold text-olive-ink">
        {s.defectPerThousand}
      </div>
      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full"
            style={{
              width: `${Math.min(100, widthPct)}%`,
              background: tone,
            }}
            title={`${s.defectCount} defects · ${fmtEur(s.defectCostEur)} cost`}
          />
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------- *
 *  Test mix donut (using a simple SVG since recharts is overkill here)
 * -------------------------------------------------------------- */

function TestMixTile({
  mix,
  totalFailedTests,
}: {
  mix: { pass: number; marginal: number; fail: number };
  totalFailedTests: number;
}) {
  const total = mix.pass + mix.marginal + mix.fail;
  const passPct = total > 0 ? (mix.pass / total) * 100 : 0;
  const marginalPct = total > 0 ? (mix.marginal / total) * 100 : 0;
  const failPct = total > 0 ? (mix.fail / total) * 100 : 0;

  // Simple ring via conic-gradient.
  const ringStyle = {
    background: total
      ? `conic-gradient(${BAND_GREEN} 0 ${passPct}%, ${BAND_AMBER} ${passPct}% ${
          passPct + marginalPct
        }%, ${BAND_RED} ${passPct + marginalPct}% 100%)`
      : `conic-gradient(${BAND_GREY} 0 100%)`,
  };

  return (
    <div className="rounded-md border border-sage-border bg-parchment">
      <div className="flex items-center justify-between gap-3 border-b border-sage-border/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
            <CheckCircle2 className="h-3 w-3" />
            Tests
          </span>
          <h3 className="truncate text-sm font-bold leading-none tracking-tight text-deep-olive">
            First-pass mix at the gates
          </h3>
        </div>
      </div>
      <div className="flex items-center gap-4 px-4 py-3">
        <div
          className="relative h-20 w-20 shrink-0 rounded-full"
          style={ringStyle}
        >
          <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-parchment">
            <div className="text-base font-bold leading-none text-deep-olive">
              {total > 0 ? Math.round(passPct) : "—"}
              {total > 0 ? "%" : ""}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-muted-olive">
              pass
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-[11px]">
          <LegendRow colour={BAND_GREEN} label="PASS" value={mix.pass} />
          <LegendRow
            colour={BAND_AMBER}
            label="MARGINAL"
            value={mix.marginal}
          />
          <LegendRow colour={BAND_RED} label="FAIL" value={mix.fail} />
          <div className="pt-1 text-[10px] text-muted-olive">
            {totalFailedTests > 0
              ? `${totalFailedTests.toLocaleString()} test runs ended FAIL in the last 6 months.`
              : "All tests passed in the last 6 months."}
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendRow({
  colour,
  label,
  value,
}: {
  colour: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: colour }}
      />
      <span className="font-mono text-muted-olive">{label}</span>
      <span className="ml-auto font-mono font-semibold text-olive-ink">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- *
 *  Formatting
 * -------------------------------------------------------------- */

function fmtEur(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 10_000) return `€ ${(n / 1000).toFixed(1)}k`;
  return `€ ${Math.round(n).toLocaleString()}`;
}
