"use client";

import { AlertTriangle, Euro, Flame, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CostScore, RiskBand, RiskScore } from "@/lib/reports/types";

const BAND_STYLE: Record<RiskBand, { bg: string; fg: string; label: string }> = {
  low: { bg: "bg-emerald-500", fg: "text-emerald-700 dark:text-emerald-300", label: "low" },
  medium: { bg: "bg-amber-500", fg: "text-amber-700 dark:text-amber-300", label: "medium" },
  high: { bg: "bg-orange-500", fg: "text-orange-700 dark:text-orange-300", label: "high" },
  critical: { bg: "bg-red-600", fg: "text-red-700 dark:text-red-300", label: "critical" },
};

export function RiskCostCard({
  risk,
  cost,
}: {
  risk: RiskScore;
  cost: CostScore;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <RiskCard risk={risk} />
      <CostCard cost={cost} />
    </div>
  );
}

function RiskCard({ risk }: { risk: RiskScore }) {
  const band = BAND_STYLE[risk.band];
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <ShieldAlert className="h-3.5 w-3.5" />
            Risk score
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className={cn("text-4xl font-extrabold tracking-tight", band.fg)}>
              {risk.value}
            </div>
            <div className="text-sm text-zinc-500">/ 100</div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white",
                band.bg,
              )}
            >
              {band.label}
            </span>
          </div>
        </div>
        {risk.band === "critical" || risk.band === "high" ? (
          <Flame className="h-6 w-6 text-red-500" />
        ) : (
          <AlertTriangle className="h-6 w-6 text-amber-400" />
        )}
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
        <div
          className={cn("h-full", band.bg)}
          style={{ width: `${Math.max(2, Math.min(100, risk.value))}%` }}
        />
      </div>
      <ul className="mt-3 space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
        {risk.rationale.map((r, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-[5px] inline-block h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CostCard({ cost }: { cost: CostScore }) {
  const fmt = (n: number) =>
    `€ ${Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const rows: Array<{ label: string; value: number; color: string }> = [
    {
      label: "In-factory defect",
      value: cost.defectCostEur,
      color: "bg-sky-500",
    },
    {
      label: "Rework labour",
      value: cost.reworkCostEur,
      color: "bg-violet-500",
    },
    {
      label: "Field claim",
      value: cost.claimCostEur,
      color: "bg-red-500",
    },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <Euro className="h-3.5 w-3.5" />
            Cost impact
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              {fmt(cost.totalEur)}
            </div>
            <div className="text-sm text-zinc-500">total</div>
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-600 dark:text-zinc-400">{r.label}</span>
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                {fmt(r.value)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
              <div
                className={cn("h-full", r.color)}
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
