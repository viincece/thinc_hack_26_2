"use client";

import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type Bucket = {
  code: string;
  count: number;
  cost: number;
  share: number;
  cumShare: number;
};

export function ParetoChart({ buckets }: { buckets: Bucket[] }) {
  const data = buckets.map((b) => ({
    code: b.code,
    count: b.count,
    cumPct: Math.round(b.cumShare * 1000) / 10,
  }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 24, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke="#d7d8d0" strokeDasharray="3 3" />
          <XAxis
            dataKey="code"
            tick={{ fontSize: 11, fill: "#65675e" }}
            stroke="#bfc1b7"
            angle={-25}
            textAnchor="end"
            interval={0}
            height={60}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: "#65675e" }}
            stroke="#bfc1b7"
            label={{
              value: "Defects",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "#65675e" },
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#65675e" }}
            stroke="#bfc1b7"
            unit="%"
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid #bfc1b7",
              background: "#fdfdf8",
              color: "#23251d",
            }}
            cursor={{ fill: "#eeefe9" }}
          />
          <Bar
            yAxisId="left"
            dataKey="count"
            fill="#4d4f46"
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumPct"
            stroke="#F54E00"
            strokeWidth={2}
            dot={{ r: 3, fill: "#F54E00", stroke: "#F54E00" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
