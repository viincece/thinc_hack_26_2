"use client";

import { Clock, Sparkles, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ResolutionStats } from "@/lib/reports/types";

export function ResolutionStatsView({ stats }: { stats: ResolutionStats }) {
  if (stats.sampleSize === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
        No previously-closed incidents of this defect code to learn from.
      </div>
    );
  }

  const rows = stats.actionTypes.map((a) => ({
    type: a.type,
    count: a.count,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.1fr]">
      {/* Summary stats */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Mean days to close"
            value={stats.meanDaysToClose != null ? stats.meanDaysToClose.toFixed(1) : "—"}
          />
          <StatTile
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Median"
            value={
              stats.medianDaysToClose != null
                ? stats.medianDaysToClose.toFixed(1)
                : "—"
            }
          />
        </div>
        <div className="text-[11px] text-zinc-500">
          Based on {stats.sampleSize} past incident
          {stats.sampleSize === 1 ? "" : "s"} with the same defect code.
        </div>

        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Action types used
          </div>
          {rows.length ? (
            <div className="h-40 w-full rounded-md border border-zinc-200 p-1 dark:border-zinc-800">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  margin={{ top: 6, right: 8, bottom: 8, left: 8 }}
                >
                  <CartesianGrid stroke="#eee" vertical={false} />
                  <XAxis
                    dataKey="type"
                    tick={{ fontSize: 10 }}
                    stroke="#a3a3a3"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10 }} stroke="#a3a3a3" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Times used" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-[11px] italic text-zinc-400">
              No closed initiatives grouped by type yet.
            </div>
          )}
        </div>
      </div>

      {/* Top actions list */}
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          <Sparkles className="h-3 w-3" />
          Top corrective actions (by frequency)
        </div>
        {stats.topActions.length ? (
          <ol className="space-y-1.5">
            {stats.topActions.map((a, i) => (
              <li
                key={`${i}-${a.text.slice(0, 12)}`}
                className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-semibold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-zinc-800 dark:text-zinc-200">
                    {a.text}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    used {a.count}×
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-[11px] italic text-zinc-400">
            No recurring phrasing found in past corrective-action comments.
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-2 text-center dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-xl font-bold text-zinc-800 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}
