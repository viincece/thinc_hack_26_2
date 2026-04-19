"use client";

import {
  Bar,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
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

type Row = {
  code: string;
  count: number;
  cumPct: number;
  /** "vital" — below 80 % cumulative, "transition" — the bar that
   *  crosses 80 %, "trivial" — everything after. */
  band: "vital" | "transition" | "trivial";
  /** Plain count label the chart shows on top of each bar. */
  label: string;
};

const BAND_FILL: Record<Row["band"], string> = {
  vital: "#dc2626",       // red-600 — the bars you act on
  transition: "#f59e0b",  // amber-500 — the pivot
  trivial: "#a1a1aa",     // zinc-400 — the long tail
};

/**
 * Custom x-axis tick that rotates the label 45° around its top-right
 * corner so the end of the label sits directly under the bar and the
 * beginning extends out to the lower-left. This avoids the "first label
 * clipped because it extends past the left margin" problem the default
 * Recharts tick has at steep rotations.
 */
function TiltedTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string | number };
}) {
  const value = String(props.payload?.value ?? "");
  const x = typeof props.x === "number" ? props.x : Number(props.x ?? 0);
  const y = typeof props.y === "number" ? props.y : Number(props.y ?? 0);
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        transform="rotate(-40)"
        textAnchor="end"
        fill="#65675e"
        fontSize={10}
        dx={-2}
        dy={6}
      >
        {value}
      </text>
    </g>
  );
}

/**
 * Compress very long tails so the chart reads well at ~220 px tall.
 * Everything past the `maxCodes`-th code is folded into a single
 * "Other (N codes)" bar; the cumulative line stays monotonic because
 * we keep the cumulative share of the collapsed chunk.
 */
const MAX_CODES = 10;
function prepareRows(buckets: Bucket[]): Row[] {
  if (!buckets.length) return [];

  const total = buckets.reduce((n, b) => n + b.count, 0) || 1;
  const kept = buckets.slice(0, MAX_CODES);
  const rest = buckets.slice(MAX_CODES);

  const flat: Array<{ code: string; count: number; share: number }> = [
    ...kept.map((b) => ({ code: b.code, count: b.count, share: b.share })),
  ];
  if (rest.length) {
    const count = rest.reduce((n, b) => n + b.count, 0);
    flat.push({
      code: `Other (${rest.length})`,
      count,
      share: count / total,
    });
  }

  // Re-derive cumulative share against the bars we're actually
  // rendering (so the "Other" aggregate's cumulative lands at 100 %).
  let running = 0;
  const raw: Array<{
    code: string;
    count: number;
    cumPct: number;
  }> = flat.map((b) => {
    running += b.share;
    return {
      code: b.code,
      count: b.count,
      cumPct: Math.round(running * 1000) / 10,
    };
  });

  // Band assignment — first bar whose cumulative crosses 80 % is the
  // transition; everything before is vital, everything after is
  // trivial.
  let transitionSeen = false;
  return raw.map((r): Row => {
    let band: Row["band"];
    if (!transitionSeen && r.cumPct >= 80) {
      band = "transition";
      transitionSeen = true;
    } else if (!transitionSeen) {
      band = "vital";
    } else {
      band = "trivial";
    }
    return {
      code: r.code,
      count: r.count,
      cumPct: r.cumPct,
      band,
      label: String(r.count),
    };
  });
}

export function ParetoChart({ buckets }: { buckets: Bucket[] }) {
  const data = prepareRows(buckets);
  if (!data.length) return null;
  const vitalCount = data.filter((r) => r.band === "vital").length;
  const transitionIdx = data.findIndex((r) => r.band === "transition");
  // Number of codes that together make up ~80 % of defects — this is the
  // single headline the engineer wants.
  const vitalDefectShare =
    transitionIdx >= 0 ? Math.round(data[transitionIdx]!.cumPct) : 100;
  const vitalCountLabel = vitalCount + (transitionIdx >= 0 ? 1 : 0);

  return (
    <div className="space-y-1">
      {/* One-line takeaway — no decorative chips. */}
      <div className="text-[11px] text-muted-olive">
        Top <b className="text-olive-ink">{vitalCountLabel}</b> codes drive{" "}
        <b className="text-olive-ink">{vitalDefectShare}%</b> of defects.
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 18, right: 16, bottom: 8, left: 8 }}
          >
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="code"
              tick={(props) => <TiltedTick {...props} />}
              stroke="#bfc1b7"
              interval={0}
              height={96}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: "#65675e" }}
              stroke="#bfc1b7"
              width={32}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "#65675e" }}
              stroke="#bfc1b7"
              unit="%"
              width={32}
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
              formatter={(v, name) => {
                if (name === "count") return [v, "Defects"];
                if (name === "cumPct") return [`${v}%`, "Cumulative"];
                return [v, name];
              }}
            />
            {/* 80% reference line — the Pareto line in its purest form. */}
            <ReferenceLine
              yAxisId="right"
              y={80}
              stroke="#94a3b8"
              strokeDasharray="4 3"
              label={{
                value: "80 %",
                position: "right",
                fontSize: 10,
                fill: "#64748b",
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="count"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            >
              {data.map((r, i) => (
                <Cell key={i} fill={BAND_FILL[r.band]} />
              ))}
              <LabelList
                dataKey="label"
                position="top"
                style={{
                  fontSize: 10,
                  fill: "#374151",
                  fontWeight: 600,
                }}
              />
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumPct"
              stroke="#64748b"
              strokeWidth={1.5}
              dot={{ r: 2.5, fill: "#64748b", stroke: "#64748b" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
