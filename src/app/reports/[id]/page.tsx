import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
  Clock,
  Euro,
  FileText,
  Link2,
  Network,
  ShieldAlert,
  Sparkles,
  Workflow,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge, severityVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadReport } from "@/lib/reports/store";
import { RiskCostCard } from "@/components/reports/risk-cost-card";
import { FaultTreeGraph } from "@/components/reports/fault-tree-graph";
import { BomTreeGraph } from "@/components/reports/bom-tree-graph";
import { EventsTimeline } from "@/components/reports/events-timeline";
import { CostTimelineChart } from "@/components/reports/cost-timeline-chart";
import { ResolutionStatsView } from "@/components/reports/resolution-stats";
import { ReportToc } from "@/components/reports/report-toc";

const TOC_ITEMS = [
  { id: "section-1", num: 1, label: "Key facts" },
  { id: "section-2", num: 2, label: "Risk & cost" },
  { id: "section-3", num: 3, label: "Fault tree" },
  { id: "section-4", num: 4, label: "BOM traceability" },
  { id: "section-5", num: 5, label: "Timeline log" },
  { id: "section-6", num: 6, label: "Cost impact" },
  { id: "section-7", num: 7, label: "Resolution" },
  { id: "section-8", num: 8, label: "Prevent recurrence" },
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) notFound();

  const f = report.facts;
  const generated = new Date(report.generatedAt);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-6 [&>[id^='section-']]:scroll-mt-20">
      <ReportToc items={TOC_ITEMS} />
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="font-mono">{report.id}</span>
          <span>· generated {generated.toLocaleString()}</span>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {report.name}
          </h1>
          {f.defect_code ? (
            <Badge variant={severityVariant(f.severity)}>{f.defect_code}</Badge>
          ) : null}
          {f.severity ? <Badge variant="outline">{f.severity}</Badge> : null}
        </div>
        <div className="mt-1 text-sm text-zinc-500">
          Derived from{" "}
          <Link
            href={`/report/new?draft_id=${report.source.draftId}`}
            className="text-sky-600 hover:underline"
          >
            8D draft {report.source.draftId} — {report.source.draftName}
          </Link>
          {report.source.defect_id ? (
            <>
              {" "}
              · anchored on defect{" "}
              <Link
                href={`/incidents/${report.source.defect_id}`}
                className="text-sky-600 hover:underline"
              >
                {report.source.defect_id}
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {/* 1 — Key facts */}
      <Card id="section-1">
        <CardHeader>
          <CardTitle>1 · Key facts</CardTitle>
          <CardDescription>
            Pulled from Manex defect detail and the knowledge graph.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Article" value={labelOf(f.article_name, f.article_id)} />
            <Field label="Product" value={f.product_id} />
            <Field
              label="Reported part"
              value={labelOf(f.reported_part_title, f.reported_part_number)}
            />
            <Field
              label="Supplier batch"
              value={
                f.supplier_batch_id
                  ? `${f.supplier_batch_id}${f.supplier_name ? ` — ${f.supplier_name}` : ""}`
                  : null
              }
            />
            <Field label="Occurrence section" value={f.occurrence_section_name} />
            <Field label="Detected section" value={f.detected_section_name} />
            <Field
              label="Cost"
              value={f.cost_eur != null ? `€ ${f.cost_eur}` : null}
            />
            <Field
              label="Observed"
              value={f.ts ? f.ts.slice(0, 19).replace("T", " ") : null}
            />
            <Field
              label="Similar defects (12 wk)"
              value={String(f.similar_count ?? 0)}
            />
            <Field
              label="Field claims on product"
              value={String(f.field_claims_count ?? 0)}
            />
            <Field label="Rework action" value={f.rework_text} />
            <Field label="Rework by" value={f.rework_user} />
          </dl>
          {f.notes ? (
            <p className="mt-3 rounded-md bg-zinc-50 p-3 text-sm leading-6 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <span className="font-semibold">Notes:</span> {f.notes}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* 2 — Risk + cost score */}
      <Card id="section-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />2 · Risk &amp; cost score
          </CardTitle>
          <CardDescription>
            Composite risk based on severity, recent frequency, field claims,
            and supplier-batch exposure. Cost aggregates the defect row,
            linked rework labour and every field claim on the product.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RiskCostCard risk={report.risk} cost={report.cost} />
        </CardContent>
      </Card>

      {/* 3 — Fault tree */}
      <Card id="section-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-violet-500" />3 · Fault tree analysis
          </CardTitle>
          <CardDescription>
            Candidate root causes from the knowledge graph, bucketed by 6M
            category. OR-gates indicate any single child can trigger the
            parent event. Circles are concrete evidence leaves.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FaultTreeGraph root={report.faultTree} />
        </CardContent>
      </Card>

      {/* 4 — BOM traceability */}
      <Card id="section-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-emerald-600" />4 · BOM traceability
          </CardTitle>
          <CardDescription>
            Where on the article this fault most likely originates.{" "}
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold uppercase text-white">
              <AlertTriangle className="h-3 w-3" /> suspect
            </span>{" "}
            marks the reported part;{" "}
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold uppercase text-white">
              watch
            </span>{" "}
            flags components with ≥ 3 prior defects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.bomTree ? (
            <BomTreeGraph root={report.bomTree} />
          ) : (
            <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
              No BOM available for this article.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5 — Timeline of events */}
      <Card id="section-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-sky-500" />5 · Timeline of events
          </CardTitle>
          <CardDescription>
            Every related row on the affected product, laid out by date:
            build → defect → rework → field claim → corrective action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventsTimeline events={report.timeline} />
        </CardContent>
      </Card>

      {/* 6 — Cost impact */}
      <Card id="section-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Euro className="h-4 w-4 text-orange-500" />6 · Cost impact timeline
          </CardTitle>
          <CardDescription>
            Cumulative € impact for this article over the last 26 weeks,
            stacked by source.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CostTimelineChart data={report.costTimeline} />
        </CardContent>
      </Card>

      {/* 7 — Resolution histogram */}
      <Card id="section-7">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />7 · How this defect
            code gets closed
          </CardTitle>
          <CardDescription>
            Mean time to close and the corrective actions that actually
            recur in closed initiatives for this defect code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResolutionStatsView stats={report.resolution} />
        </CardContent>
      </Card>

      {/* 8 — Prevention */}
      <Card id="section-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-emerald-600" />8 · Prevent
            recurrence
          </CardTitle>
          <CardDescription>{report.prevention.summary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-2 text-sm">
            {report.prevention.steps.map((s, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                    {s.detail}
                  </div>
                  {s.owner ? (
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                      Owner: {s.owner}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          {report.prevention.similarIncidents.length ? (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <Sparkles className="h-3 w-3" /> Similar past incidents
              </div>
              <ul className="space-y-1 text-sm">
                {report.prevention.similarIncidents.map((s) => (
                  <li key={s.defect_id} className="flex items-center gap-2">
                    <Link
                      href={`/incidents/${s.defect_id}`}
                      className="font-mono text-xs text-sky-600 hover:underline"
                    >
                      {s.defect_id}
                    </Link>
                    <span className="text-xs text-zinc-500">
                      {s.ts?.slice(0, 10)} · {s.defect_code}
                    </span>
                    <Badge variant={severityVariant(s.severity)}>
                      {s.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {report.prevention.openInitiatives.length ? (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <Link2 className="h-3 w-3" /> Open initiatives on this product
              </div>
              <ul className="space-y-1 text-sm">
                {report.prevention.openInitiatives.map((i) => (
                  <li key={i.action_id} className="flex items-start gap-2">
                    <span className="font-mono text-xs text-zinc-500">
                      {i.action_id}
                    </span>
                    <Badge variant="outline">{i.action_type}</Badge>
                    <Badge variant="outline">{i.status}</Badge>
                    <span className="flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300">
                      {i.comments?.split("\n")[0] ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-2 text-xs text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3 w-3" />
          Saved under /public/reports/{report.id}.json
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="text-sm">{value == null || value === "" ? "—" : value}</dd>
    </div>
  );
}

function labelOf(
  primary: string | null | undefined,
  secondary: string | null | undefined,
) {
  if (primary && secondary) return `${primary} (${secondary})`;
  return primary ?? secondary ?? null;
}
