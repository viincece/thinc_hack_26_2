import { store } from "@/lib/storage/object-store";
import type { IncidentReport, ReportSummary } from "./types";

export const REPORTS_PREFIX = "reports";

export function newReportId(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ymd = `${d.getFullYear().toString().slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `IR-${ymd}-${rand}`;
}

function filename(id: string): string {
  return `${id}.json`;
}

function keyFor(id: string): string {
  return `${REPORTS_PREFIX}/${filename(id)}`;
}

export async function saveReport(report: IncidentReport): Promise<ReportSummary> {
  const body = JSON.stringify(report, null, 2);
  await store().put(keyFor(report.id), body);
  return {
    id: report.id,
    name: report.name,
    generatedAt: report.generatedAt,
    sourceDraftId: report.source.draftId,
    articleName: report.facts.article_name,
    defectCode: report.facts.defect_code,
    filename: filename(report.id),
    sizeBytes: Buffer.byteLength(body, "utf8"),
  };
}

export async function loadReport(id: string): Promise<IncidentReport | null> {
  const raw = await store().get(keyFor(id));
  if (!raw) return null;
  try {
    return normalizeReport(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Backfill defaults for every field added after the first few reports
 * were written — lets older JSON files on disk keep rendering instead
 * of crashing the page after a schema extension.
 */
function normalizeReport(raw: unknown): IncidentReport {
  const r = (raw ?? {}) as Partial<IncidentReport>;
  return {
    id: r.id ?? "unknown",
    name: r.name ?? "Incident analysis",
    generatedAt: r.generatedAt ?? new Date(0).toISOString(),
    source: r.source ?? { draftId: "", draftName: "" },
    facts:
      r.facts ??
      ({
        similar_count: 0,
        field_claims_count: 0,
      } as IncidentReport["facts"]),
    risk:
      r.risk ?? {
        value: 0,
        band: "low",
        rationale: ["Not computed — regenerate the analysis to populate."],
      },
    cost:
      r.cost ?? {
        defectCostEur: 0,
        reworkCostEur: 0,
        claimCostEur: 0,
        totalEur: 0,
        rationale: ["Not computed — regenerate the analysis to populate."],
      },
    faultTree:
      r.faultTree ?? {
        id: "root",
        kind: "defect",
        label: "No fault tree saved — regenerate the analysis.",
        children: [],
      },
    bomTree: r.bomTree ?? null,
    timeline: r.timeline ?? [],
    costTimeline: r.costTimeline ?? [],
    resolution:
      r.resolution ?? {
        sampleSize: 0,
        meanDaysToClose: null,
        medianDaysToClose: null,
        actionTypes: [],
        topActions: [],
      },
    prevention:
      r.prevention ?? {
        summary: "",
        steps: [],
        similarIncidents: [],
        openInitiatives: [],
      },
  };
}

export async function listReports(): Promise<ReportSummary[]> {
  const entries = await store().list(REPORTS_PREFIX);
  const out: ReportSummary[] = [];
  for (const entry of entries) {
    const name = entry.pathname.slice(REPORTS_PREFIX.length + 1);
    if (!name.endsWith(".json")) continue;
    const raw = await store().get(entry.pathname);
    if (!raw) continue;
    try {
      const r = JSON.parse(raw) as IncidentReport;
      out.push({
        id: r.id,
        name: r.name,
        generatedAt: r.generatedAt,
        sourceDraftId: r.source?.draftId ?? "",
        articleName: r.facts?.article_name,
        defectCode: r.facts?.defect_code,
        filename: name,
        sizeBytes: entry.size,
      });
    } catch {
      /* skip malformed */
    }
  }
  out.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
  return out;
}

export async function deleteReport(id: string): Promise<boolean> {
  await store().remove(keyFor(id));
  return true;
}
