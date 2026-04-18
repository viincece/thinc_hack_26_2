"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendBucket = {
  weekStart: string;    // YYYY-MM-DD (Monday of ISO week)
  weekLabel: string;    // YYYY-Www
  defects: number;
  costEur: number;
};

const BLUE = "#2563eb";
const YELLOW = "#eab308";

export function DefectTrendChart({ data }: { data: TrendBucket[] }) {
  if (!data.length) {
    return (
      <div className="rounded-md border border-dashed border-sage-border p-6 text-center text-sm text-muted-olive">
        No defect data in the last 26 weeks.
      </div>
    );
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 16, bottom: 20, left: 8 }}
        >
          <CartesianGrid stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="weekLabel"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
            minTickGap={14}
            angle={-30}
            textAnchor="end"
            height={46}
            stroke="#a3a3a3"
          />
          <YAxis
            yAxisId="defects"
            tick={{ fontSize: 10 }}
            stroke={BLUE}
            allowDecimals={false}
            label={{
              value: "Defects",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: BLUE },
            }}
          />
          <YAxis
            yAxisId="cost"
            orientation="right"
            tick={{ fontSize: 10 }}
            stroke={YELLOW}
            tickFormatter={(v) => `€${Math.round(Number(v))}`}
            label={{
              value: "Cost (€)",
              angle: 90,
              position: "insideRight",
              style: { fontSize: 11, fill: YELLOW },
            }}
          />
          <Tooltip
            labelFormatter={(l) => `Week of ${l}`}
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : Number(value ?? 0);
              return name === "Cost"
                ? [`€ ${Math.round(n).toLocaleString()}`, name]
                : [n, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            yAxisId="defects"
            type="monotone"
            dataKey="defects"
            name="Defects"
            stroke={BLUE}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            activeDot={{ r: 4.5 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="cost"
            type="monotone"
            dataKey="costEur"
            name="Cost"
            stroke={YELLOW}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            activeDot={{ r: 4.5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
