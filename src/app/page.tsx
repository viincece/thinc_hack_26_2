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
      limit: 8,
    });
  } catch {
    return [];
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
  const [pareto, defects, counts] = await Promise.all([
    getPareto(),
    getRecentDefects(),
    getCounts(),
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
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/incidents">
              Browse incidents <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
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
            <CardDescription>Latest 8 rows from v_defect_detail.</CardDescription>
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
          <CardTitle>Next up</CardTitle>
          <CardDescription>
            This scaffold has the data layer wired. Upcoming: fault tree, BOM
            traceability, Sankey (supplier → batch → defect), operator Pareto,
            and the S³ agent with SQL + wiki tools.
          </CardDescription>
        </CardHeader>
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
