"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CostTimelineBucket } from "@/lib/reports/types";

export function CostTimelineChart({
  data,
}: {
  data: CostTimelineBucket[];
}) {
  if (!data.length) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
        No cost data yet for this article in the last 26 weeks.
      </div>
    );
  }
  const rows = data.map((d) => ({
    wk: d.weekStart.slice(5),
    defect: d.defectEur,
    claim: d.claimEur,
  }));
  const total = data.reduce((s, d) => s + d.defectEur + d.claimEur, 0);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] text-zinc-500">
          Last {data.length} weeks · stacked €
        </div>
        <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
          {`€ ${Math.round(total).toLocaleString()} total`}
        </div>
      </div>
      <div className="h-60 w-full rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
            <CartesianGrid stroke="#eee" vertical={false} />
            <XAxis
              dataKey="wk"
              tick={{ fontSize: 10 }}
              stroke="#a3a3a3"
              angle={-30}
              textAnchor="end"
              height={40}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `€${v}`}
              stroke="#a3a3a3"
            />
            <Tooltip
              formatter={(v) => {
                const n = typeof v === "number" ? v : Number(v ?? 0);
                return `€ ${Math.round(n).toLocaleString()}`;
              }}
              labelFormatter={(l) => `Week of ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="defect"
              name="In-factory defect"
              stackId="eur"
              fill="#0ea5e9"
            />
            <Bar
              dataKey="claim"
              name="Field claim"
              stackId="eur"
              fill="#ef4444"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
