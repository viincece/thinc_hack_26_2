"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DeltaSummary } from "@/lib/dashboard/window";

/**
 * One KPI tile in the dashboard's "Quality signals" strip.
 *
 * The tile is intentionally plain: a two-line block on the left (label +
 * big value, with an optional secondary text line + delta chip under the
 * value) and an optional 40-px sparkline on the right. No hover
 * interactions — the strip is meant for instant scanning, not drill-in.
 */
export type KpiTileProps = {
  label: string;
  value: string;
  /** Free-form secondary text: "SOLDER_COLD ×11", "2 need triage", …. */
  secondary?: string | null;
  delta?: DeltaSummary | null;
  /**
   * 7–12 numeric buckets that cover the current window in chronological
   * order. Omit (or pass a zeros-only array) to hide the sparkline.
   */
  sparkline?: number[] | null;
  /** Colour override; defaults to the delta-kind colour, then olive. */
  color?: string;
};

function colourForDelta(kind: DeltaSummary["kind"] | undefined): string {
  switch (kind) {
    case "good":
      return "text-emerald-700";
    case "bad":
      return "text-amber-700";
    case "flat":
    case "neutral":
    default:
      return "text-muted-olive";
  }
}

function sparkColour(
  color: string | undefined,
  deltaKind: DeltaSummary["kind"] | undefined,
): string {
  if (color) return color;
  switch (deltaKind) {
    case "good":
      return "#047857"; // emerald-700
    case "bad":
      return "#b45309"; // amber-700
    default:
      return "#6b7280"; // muted-olive / zinc-500
  }
}

export function KpiTile({
  label,
  value,
  secondary,
  delta,
  sparkline,
  color,
}: KpiTileProps) {
  const hasSpark =
    !!sparkline && sparkline.length > 1 && sparkline.some((v) => v > 0);
  const sparkData = hasSpark
    ? sparkline!.map((v, i) => ({ i, v }))
    : [];
  const stroke = sparkColour(color, delta?.kind);
  const deltaColour = colourForDelta(delta?.kind);

  return (
    <Card className="transition-colors hover:border-light-border">
      <CardContent className="flex items-stretch gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
            {label}
          </div>
          <div className="mt-0.5 truncate font-sans text-2xl font-extrabold leading-none text-deep-olive">
            {value}
          </div>
          <div className="mt-1 min-h-[14px] space-y-0.5">
            {secondary ? (
              <div className="truncate text-[11px] leading-tight text-muted-olive">
                {secondary}
              </div>
            ) : null}
            {delta ? (
              <div
                className={cn(
                  "truncate text-[10px] font-medium leading-tight",
                  deltaColour,
                )}
                title={delta.label}
              >
                {delta.label}
              </div>
            ) : null}
          </div>
        </div>
        {hasSpark ? (
          <div className="h-10 w-[70px] shrink-0 self-end">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={stroke}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
