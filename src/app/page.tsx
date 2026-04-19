import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { ArrowRight, AlertTriangle, Boxes, Factory, Radio } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge, severityVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ParetoChart } from "@/components/pareto-chart";
import { manex, type DefectDetail } from "@/lib/manex";
import { NewAnalysisButton } from "@/components/reports/new-analysis-dialog";
import {
  DefectTrendChart,
  type ForecastPayload,
  type TrendBucket,
} from "@/components/dashboard/defect-trend-chart";
import { VoiceReportsCard } from "@/components/dashboard/voice-reports-card";
import { listQmReports } from "@/lib/qm-reports/manex";

/**
 * Maximum age of the forecast JSON before we treat it as stale and hide
 * the dashed lines. The Python job is meant to refresh daily; two weeks
 * is a generous grace window during hackathon demos but still keeps us
 * honest about "this prediction is fresh".
 */
const FORECAST_MAX_AGE_DAYS = 14;

export const dynamic = "force-dynamic";

type Bucket = {
  code: string;
  count: number;
  cost: number;
  share: number;
  cumShare: number;
};

async function getPareto(): Promise<{ total: number; buckets: Bucket[] }> {
  try {
    const rows = await manex<DefectDetail[]>("/v_defect_detail", {
      select: "defect_code,cost,defect_ts",
      order: "defect_ts.desc",
      limit: 5000,
    });
    const map = new Map<string, Bucket>();
    for (const r of rows) {
      const code = r.defect_code ?? "UNKNOWN";
      const b = map.get(code) ?? { code, count: 0, cost: 0, share: 0, cumShare: 0 };
      b.count += 1;
      b.cost += Number(r.cost ?? 0);
      map.set(code, b);
    }
    const sorted = [...map.values()].sort((a, b) => b.count - a.count);
    const total = sorted.reduce((s, b) => s + b.count, 0);
    let running = 0;
    const buckets = sorted.map((b) => {
      running += b.count;
      return {
        ...b,
        share: total ? b.count / total : 0,
        cumShare: total ? running / total : 0,
      };
    });
    return { total, buckets };
  } catch {
    return { total: 0, buckets: [] };
  }
}

async function getRecentDefects(): Promise<DefectDetail[]> {
  try {
    return await manex<DefectDetail[]>("/v_defect_detail", {
      order: "defect_ts.desc",
      limit: 5,
    });
  } catch {
    return [];
  }
}

/**
 * Weekly count + cost rollup for the last 26 weeks — feeds the dual-axis
 * dashboard trend line.
 */
async function getWeeklyTrend(): Promise<TrendBucket[]> {
  try {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 26 * 7);
    since.setUTCHours(0, 0, 0, 0);
    const rows = await manex<
      Array<{ defect_ts?: string | null; cost?: number | null }>
    >("/v_defect_detail", {
      select: "defect_ts,cost",
      order: "defect_ts.desc",
      limit: 5000,
      defect_ts: `gte.${since.toISOString().slice(0, 10)}`,
    });
    const buckets = new Map<string, { defects: number; costEur: number }>();
    for (const r of rows) {
      const when = r.defect_ts;
      if (!when) continue;
      const d = new Date(when);
      if (Number.isNaN(d.getTime())) continue;
      const { key } = isoWeek(d);
      const cur = buckets.get(key) ?? { defects: 0, costEur: 0 };
      cur.defects += 1;
      cur.costEur += Number(r.cost ?? 0);
      buckets.set(key, cur);
    }

    // Fill missing weeks inside the window with zeros so the line is
    // continuous instead of skipping gaps.
    const out: TrendBucket[] = [];
    const cursor = mondayOf(since);
    const end = mondayOf(new Date());
    while (cursor <= end) {
      const { key, label } = isoWeek(cursor);
      const cur = buckets.get(key) ?? { defects: 0, costEur: 0 };
      out.push({
        weekStart: cursor.toISOString().slice(0, 10),
        weekLabel: label,
        defects: cur.defects,
        costEur: Math.round(cur.costEur * 100) / 100,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return out;
  } catch {
    return [];
  }
}

function mondayOf(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // JS: 0=Sun .. 6=Sat. ISO week starts Mon.
  const day = out.getUTCDay();
  const shift = (day + 6) % 7; // 0 for Mon, 6 for Sun
  out.setUTCDate(out.getUTCDate() - shift);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function isoWeek(d: Date): { key: string; label: string } {
  // ISO week-numbering per https://en.wikipedia.org/wiki/ISO_week_date
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7; // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  const label = `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  return { key: label, label };
}

/**
 * Read the daily TabPFN forecast produced by
 * `web/scripts/forecast/forecast.py`. Returns null (no error surfaced to
 * the user) if the file is missing, malformed, or older than
 * FORECAST_MAX_AGE_DAYS — the chart then silently renders history only.
 */
async function getForecast(): Promise<ForecastPayload | null> {
  try {
    const p = path.join(
      process.cwd(),
      "public",
      "forecast",
      "defect-cost.json",
    );
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<ForecastPayload>;
    if (!parsed || !Array.isArray(parsed.forecast) || parsed.forecast.length === 0)
      return null;
    if (typeof parsed.generatedAt !== "string") return null;
    const ageMs = Date.now() - new Date(parsed.generatedAt).getTime();
    if (!Number.isFinite(ageMs)) return null;
    if (ageMs > FORECAST_MAX_AGE_DAYS * 24 * 3600 * 1000) return null;
    return parsed as ForecastPayload;
  } catch {
    return null;
  }
}

async function getCounts() {
  const safe = async (path: string) => {
    try {
      const rows = await manex<unknown[]>(path, { limit: 1, select: "*" });
      // PostgREST returns Content-Range for total count, but we keep it simple.
      return Array.isArray(rows) ? rows.length : 0;
    } catch {
      return 0;
    }
  };
  const [defects, claims, actions] = await Promise.all([
    safe("/defect"),
    safe("/field_claim"),
    safe("/product_action"),
  ]);
  return { defects, claims, actions };
}

export default async function Home() {
  const [pareto, defects, counts, trend, forecast, voiceReports] =
    await Promise.all([
      getPareto(),
      getRecentDefects(),
      getCounts(),
      getWeeklyTrend(),
      getForecast(),
      listQmReports({ limit: 5 }),
    ]);

  const apiOk = pareto.total > 0 || defects.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-3 px-6 py-5">
      {/* Hero — single dense row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-cream px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-olive ring-1 ring-inset ring-sage-border">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
            Live
          </span>
          <h1 className="truncate text-xl font-extrabold leading-none tracking-tight text-deep-olive">
            Quality signals across the shop floor
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/incidents">
              Browse incidents <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <NewAnalysisButton variant="outline" />
          <Button asChild size="sm">
            <Link href="/report/new">New 8D report</Link>
          </Button>
        </div>
      </div>

      {!apiOk ? (
        <Card className="border-[color:var(--color-gold-border)]/50 bg-[color:var(--color-warm-tan)]/40">
          <CardHeader>
            <CardTitle className="text-deep-olive">
              Can&apos;t reach the Manex API
            </CardTitle>
            <CardDescription className="text-muted-olive">
              Check <code>MANEX_API_URL</code> and <code>MANEX_API_KEY</code> in{" "}
              <code>.env.local</code>, then restart <code>next dev</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {/* KPI strip — 4-up on md, compact */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Defect codes"
          value={pareto.buckets.length.toString()}
          hint={`${pareto.total} defects total`}
        />
        <StatCard
          icon={<Factory className="h-3.5 w-3.5" />}
          label="Field claims"
          value={counts.claims > 0 ? "tracking" : "—"}
          hint="/field_claim"
        />
        <StatCard
          icon={<Boxes className="h-3.5 w-3.5" />}
          label="Initiatives"
          value={counts.actions > 0 ? "active" : "—"}
          hint="/product_action"
        />
        <StatCard
          icon={<Radio className="h-3.5 w-3.5" />}
          label="Voice reports"
          value={voiceReports.length.toString()}
          hint="last 24 h"
        />
      </div>

      {/* Live feeds — voice reports + recent defects side-by-side */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <VoiceReportsCard initialItems={voiceReports} />

        <Card className="flex h-full flex-col">
          <CardHeader className="px-3 pb-2 pt-3">
            <CardTitle className="text-sm">Recent defects</CardTitle>
            <CardDescription className="text-[11px] leading-tight">
              Latest 5 defects on the shop floor.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-1 px-2 pb-2 pt-0">
            {defects.length ? (
              defects.map((d) => (
                <Link
                  key={d.defect_id}
                  href={`/incidents/${d.defect_id}`}
                  className="flex items-center gap-2 rounded-md border border-sage-border/70 bg-white/60 px-2 py-1 text-[12px] hover:border-light-border hover:bg-white"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {d.defect_code}
                  </span>
                  <Badge variant={severityVariant(d.severity)}>
                    {d.severity}
                  </Badge>
                  <span className="shrink-0 truncate text-[10px] text-muted-olive">
                    {d.product_id}
                    {d.reported_part_number ? ` · ${d.reported_part_number}` : ""}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-olive">
                    {dateOnly(d)}
                  </span>
                </Link>
              ))
            ) : (
              <Empty>No recent defects.</Empty>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analytics — trend + Pareto side-by-side */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="px-4 pb-2 pt-3">
            <CardTitle className="text-sm">
              Defects &amp; cost — last 6 months
            </CardTitle>
            <CardDescription className="text-[11px] leading-tight">
              Weekly defects (
              <span className="font-semibold text-[color:#2563eb]">blue</span>)
              vs. cost €{" "}
              <span className="font-semibold text-[color:#eab308]">yellow</span>
              {forecast ? " · dashed = 12-week TabPFN forecast" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <DefectTrendChart data={trend} forecast={forecast} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="px-4 pb-2 pt-3">
            <CardTitle className="text-sm">Defect Pareto</CardTitle>
            <CardDescription className="text-[11px] leading-tight">
              80/20 across all defects. Detection-bias: a tall &quot;Pruefung
              Linie 2&quot; bar is not a root cause.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {pareto.buckets.length ? (
              <ParetoChart buckets={pareto.buckets} />
            ) : (
              <Empty>No defect data.</Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="transition-colors hover:border-light-border">
      <CardContent className="flex items-center justify-between px-3 py-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
            {label}
          </div>
          <div className="mt-0.5 font-sans text-2xl font-extrabold leading-none text-deep-olive">
            {value}
          </div>
          {hint ? (
            <div className="mt-0.5 text-[10px] text-muted-olive">{hint}</div>
          ) : null}
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sage-cream text-olive-ink ring-1 ring-inset ring-sage-border">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function dateOnly(d: DefectDetail): string {
  // The view exposes the defect timestamp as `defect_ts`; the flat
  // `defect` table uses `ts`. Accept either via a loose record cast.
  const anyD = d as unknown as Record<string, string | undefined>;
  const when = anyD.defect_ts ?? anyD.ts;
  return when ? new Date(when).toISOString().slice(0, 10) : "";
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
      {children}
    </div>
  );
}
