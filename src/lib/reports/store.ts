import { promises as fs } from "node:fs";
import path from "node:path";
import type { IncidentReport, ReportSummary } from "./types";

export const REPORTS_DIR = path.join(process.cwd(), "public", "reports");

async function ensureDir() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

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

export async function saveReport(report: IncidentReport): Promise<ReportSummary> {
  await ensureDir();
  const full = path.join(REPORTS_DIR, filename(report.id));
  await fs.writeFile(full, JSON.stringify(report, null, 2), "utf8");
  const stat = await fs.stat(full);
  return {
    id: report.id,
    name: report.name,
    generatedAt: report.generatedAt,
    sourceDraftId: report.source.draftId,
    articleName: report.facts.article_name,
    defectCode: report.facts.defect_code,
    filename: filename(report.id),
    sizeBytes: stat.size,
  };
}

export async function loadReport(id: string): Promise<IncidentReport | null> {
  await ensureDir();
  const full = path.join(REPORTS_DIR, filename(id));
  try {
    const raw = await fs.readFile(full, "utf8");
    return normalizeReport(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Backfill defaults for every field added after the first few reports
 * were written — lets older JSON files on disk keep rendering instead of
 * crashing the page after a schema extension.
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
  await ensureDir();
  const entries = await fs.readdir(REPORTS_DIR).catch(() => []);
  const out: ReportSummary[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const full = path.join(REPORTS_DIR, name);
    try {
      const raw = await fs.readFile(full, "utf8");
      const r = JSON.parse(raw) as IncidentReport;
      const stat = await fs.stat(full);
      out.push({
        id: r.id,
        name: r.name,
        generatedAt: r.generatedAt,
        sourceDraftId: r.source.draftId,
        articleName: r.facts.article_name,
        defectCode: r.facts.defect_code,
        filename: name,
        sizeBytes: stat.size,
      });
    } catch {
      /* skip malformed */
    }
  }
  out.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
  return out;
}

export async function deleteReport(id: string): Promise<boolean> {
  await ensureDir();
  const full = path.join(REPORTS_DIR, filename(id));
  try {
    await fs.unlink(full);
    return true;
  } catch {
    return false;
  }
}
