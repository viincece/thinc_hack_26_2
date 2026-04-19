import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { ArrowRight, AlertTriangle, Boxes, Factory } from "lucide-react";
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
  const [pareto, defects, counts, trend, forecast] = await Promise.all([
    getPareto(),
    getRecentDefects(),
    getCounts(),
    getWeeklyTrend(),
    getForecast(),
  ]);

  const apiOk = pareto.total > 0 || defects.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex items-start justify-between gap-6">
        <div className="max-w-2xl">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-sage-cream px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-olive ring-1 ring-inset ring-sage-border">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
            Live shopfloor feed
          </div>
          <h1 className="text-3xl font-extrabold leading-[1.15] tracking-tight text-deep-olive">
            Quality signals across the shop floor.
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-olive">
            Pulled live from the Manex API — defects, claims, and initiatives,
            so you can spot the pattern before you close the ticket.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/incidents">
              Browse incidents <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <NewAnalysisButton variant="outline" />
          <Button asChild>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Defect codes"
          value={pareto.buckets.length.toString()}
          hint={`${pareto.total} defects total`}
        />
        <StatCard
          icon={<Factory className="h-4 w-4" />}
          label="Open field claims"
          value={counts.claims > 0 ? "tracking" : "—"}
          hint="Source: /field_claim"
        />
        <StatCard
          icon={<Boxes className="h-4 w-4" />}
          label="Initiatives"
          value={counts.actions > 0 ? "active" : "—"}
          hint="Source: /product_action"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Defect Pareto</CardTitle>
            <CardDescription>
              80/20 view across all in-factory defects. Detection-bias warning:
              the &quot;Pruefung Linie 2&quot; section gates most defects — a
              big bar here is not a root cause.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pareto.buckets.length ? (
              <ParetoChart buckets={pareto.buckets} />
            ) : (
              <Empty>No defect data.</Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent defects</CardTitle>
            <CardDescription>Latest 5 defects on the shop floor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {defects.length ? (
              defects.map((d) => (
                <Link
                  key={d.defect_id}
                  href={`/incidents/${d.defect_id}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{d.defect_code}</span>
                      <Badge variant={severityVariant(d.severity)}>
                        {d.severity}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {d.product_id}
                      {d.reported_part_number
                        ? ` · ${d.reported_part_number}`
                        : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-zinc-500">
                    {d.ts ? new Date(d.ts).toISOString().slice(0, 10) : ""}
                  </div>
                </Link>
              ))
            ) : (
              <Empty>No recent defects.</Empty>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Defects &amp; cost — last 6 months</CardTitle>
          <CardDescription>
            Weekly defect count (
            <span className="font-semibold text-[color:#2563eb]">blue</span>)
            against inflicted cost in € (
            <span className="font-semibold text-[color:#eab308]">yellow</span>).
            {forecast
              ? " Dashed lines are a TabPFN forecast for the next 12 weeks."
              : " Missing weeks are filled with zero."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DefectTrendChart data={trend} forecast={forecast} />
        </CardContent>
      </Card>
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
      <CardContent className="flex items-center justify-between pt-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-olive">
            {label}
          </div>
          <div className="mt-1 font-sans text-3xl font-extrabold leading-none text-deep-olive">
            {value}
          </div>
          {hint ? (
            <div className="mt-1.5 text-xs text-muted-olive">{hint}</div>
          ) : null}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sage-cream text-olive-ink ring-1 ring-inset ring-sage-border">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
      {children}
    </div>
  );
}
