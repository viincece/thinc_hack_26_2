"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendBucket = {
  weekStart: string; // YYYY-MM-DD (Monday of ISO week)
  weekLabel: string; // YYYY-Www
  defects: number;
  costEur: number;
};

/**
 * p10/p50/p90 quantile forecast for a single metric for one future week.
 * Produced by `web/scripts/forecast/forecast.py` via TabPFN.
 */
export type ForecastBand = {
  p10: number;
  p50: number;
  p90: number;
};

export type ForecastBucket = {
  weekStart: string;
  weekLabel: string;
  defects: ForecastBand;
  costEur: ForecastBand;
};

export type ForecastPayload = {
  generatedAt: string;
  lookbackWeeks: number;
  horizonWeeks: number;
  rowsUsed?: number;
  forecast: ForecastBucket[];
};

const BLUE = "#2563eb";
const YELLOW = "#eab308";

/**
 * Row shape consumed by Recharts. Keys mirror both the historical and
 * forecast overlays so a single chart can render them together; nulls
 * are skipped by Recharts when `connectNulls` is off.
 */
type ChartRow = {
  weekLabel: string;
  // Historical metrics — null for future weeks.
  defects: number | null;
  costEur: number | null;
  // Forecast median + [p10, p90] range — null for historical weeks, with
  // one anchor exception so the dashed line visually continues from the
  // last actual observation.
  defectsFcst: number | null;
  defectsRange: [number, number] | null;
  costFcst: number | null;
  costRange: [number, number] | null;
};

function buildRows(
  data: TrendBucket[],
  forecast: ForecastBucket[] | null,
): ChartRow[] {
  const rows: ChartRow[] = data.map((b) => ({
    weekLabel: b.weekLabel,
    defects: b.defects,
    costEur: b.costEur,
    defectsFcst: null,
    defectsRange: null,
    costFcst: null,
    costRange: null,
  }));

  if (!forecast || forecast.length === 0 || rows.length === 0) return rows;

  // Anchor: mirror the last historical point onto the forecast keys so
  // the dashed line + ribbon start flush against the solid line instead
  // of "floating" one week off to the right.
  const last = rows[rows.length - 1]!;
  last.defectsFcst = last.defects;
  last.defectsRange =
    last.defects != null ? [last.defects, last.defects] : null;
  last.costFcst = last.costEur;
  last.costRange =
    last.costEur != null ? [last.costEur, last.costEur] : null;

  for (const f of forecast) {
    rows.push({
      weekLabel: f.weekLabel,
      defects: null,
      costEur: null,
      defectsFcst: f.defects.p50,
      defectsRange: [f.defects.p10, f.defects.p90],
      costFcst: f.costEur.p50,
      costRange: [f.costEur.p10, f.costEur.p90],
    });
  }
  return rows;
}

export function DefectTrendChart({
  data,
  forecast,
}: {
  data: TrendBucket[];
  forecast?: ForecastPayload | null;
}) {
  if (!data.length) {
    return (
      <div className="rounded-md border border-dashed border-sage-border p-6 text-center text-sm text-muted-olive">
        No defect data in the last 26 weeks.
      </div>
    );
  }

  const hasForecast =
    !!forecast && Array.isArray(forecast.forecast) && forecast.forecast.length > 0;
  const rows = buildRows(data, hasForecast ? forecast!.forecast : null);

  return (
    <div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
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
                // Recharts feeds the `Area` entries a `[low, high]`
                // tuple. Coercing that with `Number(...)` yields NaN and
                // React warns about `Received NaN for the children
                // attribute`. Format ranges explicitly instead.
                const isCost =
                  typeof name === "string" && name.toLowerCase().includes("cost");
                if (Array.isArray(value)) {
                  const [lo, hi] = value as [number, number];
                  if (!Number.isFinite(lo) || !Number.isFinite(hi))
                    return ["—", name];
                  return isCost
                    ? [
                        `€ ${Math.round(lo).toLocaleString()} – € ${Math.round(hi).toLocaleString()}`,
                        name,
                      ]
                    : [
                        `${Math.round(lo * 10) / 10} – ${Math.round(hi * 10) / 10}`,
                        name,
                      ];
                }
                if (value == null) return ["—", name];
                const n = typeof value === "number" ? value : Number(value);
                if (!Number.isFinite(n)) return ["—", name];
                return isCost
                  ? [`€ ${Math.round(n).toLocaleString()}`, name]
                  : [n, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />

            {/* Uncertainty ribbons (rendered first so lines sit on top). */}
            {hasForecast ? (
              <>
                <Area
                  yAxisId="defects"
                  dataKey="defectsRange"
                  name="Defects p10–p90"
                  stroke="none"
                  fill={BLUE}
                  fillOpacity={0.12}
                  isAnimationActive={false}
                  legendType="none"
                />
                <Area
                  yAxisId="cost"
                  dataKey="costRange"
                  name="Cost p10–p90"
                  stroke="none"
                  fill={YELLOW}
                  fillOpacity={0.12}
                  isAnimationActive={false}
                  legendType="none"
                />
              </>
            ) : null}

            {/* Historical (solid). */}
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
              connectNulls={false}
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
              connectNulls={false}
            />

            {/* Forecast medians (dashed, same colour). */}
            {hasForecast ? (
              <>
                <Line
                  yAxisId="defects"
                  type="monotone"
                  dataKey="defectsFcst"
                  name="Defects forecast (median)"
                  stroke={BLUE}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  yAxisId="cost"
                  type="monotone"
                  dataKey="costFcst"
                  name="Cost forecast (median)"
                  stroke={YELLOW}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                />
              </>
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {hasForecast ? (
        <div className="mt-2 text-[11px] text-muted-olive">
          Dashed line = TabPFN median forecast · shaded band = p10–p90 · horizon{" "}
          {forecast!.horizonWeeks} weeks · generated{" "}
          {new Date(forecast!.generatedAt).toISOString().slice(0, 10)}
        </div>
      ) : null}
    </div>
  );
}
