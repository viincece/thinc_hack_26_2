import { manex } from "@/lib/manex";
import { listQmReports } from "@/lib/qm-reports/manex";
import type { QmReportListItem } from "@/lib/qm-reports/types";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { WindowTabs } from "@/components/dashboard/window-tabs";
import {
  BUCKET_CONFIG,
  WINDOW_LABEL,
  WINDOW_MS,
  bucketEdges,
  computeDelta,
  currentWindow,
  formatEurShort,
  previousWindow,
  type WindowKey,
} from "@/lib/dashboard/window";

/**
 * Max lookback for the single Manex fetch. The 6-month window needs
 * ~364 days of history (two × 182-day windows) so the "previous window"
 * delta still works at the largest preset.
 */
const MAX_LOOKBACK_DAYS = 365;

type DefectRow = {
  defect_ts?: string | null;
  cost?: number | null;
  defect_code?: string | null;
};

async function fetchDefectsForDashboard(): Promise<DefectRow[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - MAX_LOOKBACK_DAYS);
  since.setUTCHours(0, 0, 0, 0);
  try {
    return await manex<DefectRow[]>("/v_defect_detail", {
      select: "defect_ts,cost,defect_code",
      order: "defect_ts.desc",
      limit: 10_000,
      defect_ts: `gte.${since.toISOString().slice(0, 10)}`,
    });
  } catch {
    return [];
  }
}

async function fetchDefectCodeCatalogueSize(): Promise<number> {
  // How many codes the factory *can* emit (independent of window). Used
  // for the "6 of 14" display on the Defect Types tile.
  try {
    const rows = await manex<{ defect_code: string | null }[]>(
      "/v_defect_detail",
      { select: "defect_code", limit: 10_000 },
    );
    const seen = new Set<string>();
    for (const r of rows) if (r.defect_code) seen.add(r.defect_code);
    return seen.size;
  } catch {
    return 0;
  }
}

/** Convert the raw DefectDetail timestamp (either `defect_ts` or `ts`). */
function rowTs(r: DefectRow): number {
  if (!r.defect_ts) return NaN;
  const t = new Date(r.defect_ts).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function rowsInRange(
  rows: DefectRow[],
  start: number,
  end: number,
): DefectRow[] {
  return rows.filter((r) => {
    const t = rowTs(r);
    return t >= start && t < end;
  });
}

function bucketCounts(
  rows: DefectRow[],
  edges: ReturnType<typeof bucketEdges>,
): number[] {
  const out = Array(edges.length).fill(0);
  for (const r of rows) {
    const t = rowTs(r);
    if (!Number.isFinite(t)) continue;
    for (let i = 0; i < edges.length; i++) {
      if (t >= edges[i]!.start && t < edges[i]!.end) {
        out[i] += 1;
        break;
      }
    }
  }
  return out;
}

function bucketCostSums(
  rows: DefectRow[],
  edges: ReturnType<typeof bucketEdges>,
): number[] {
  const out = Array(edges.length).fill(0);
  for (const r of rows) {
    const t = rowTs(r);
    if (!Number.isFinite(t)) continue;
    for (let i = 0; i < edges.length; i++) {
      if (t >= edges[i]!.start && t < edges[i]!.end) {
        out[i] += Number(r.cost ?? 0);
        break;
      }
    }
  }
  return out;
}

function bucketVoiceReports(
  reports: QmReportListItem[],
  edges: ReturnType<typeof bucketEdges>,
): number[] {
  const out = Array(edges.length).fill(0);
  for (const r of reports) {
    const t = new Date(r.receivedAt).getTime();
    if (!Number.isFinite(t)) continue;
    for (let i = 0; i < edges.length; i++) {
      if (t >= edges[i]!.start && t < edges[i]!.end) {
        out[i] += 1;
        break;
      }
    }
  }
  return out;
}

function topCodes(
  rows: DefectRow[],
  n = 2,
): Array<{ code: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const c = r.defect_code ?? "UNKNOWN";
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([code, count]) => ({ code, count }));
}

/**
 * The KPI strip. Renders a tight subtitle + 4-tab selector, then 4
 * tiles computed from a single `/v_defect_detail` fetch + voice-reports
 * call. All metrics are filtered in-memory so changing window is free.
 */
export async function QualitySignals({
  windowKey,
}: {
  windowKey: WindowKey;
}) {
  const now = Date.now();
  const cur = currentWindow(windowKey, now);
  const prev = previousWindow(windowKey, now);
  const edges = bucketEdges(windowKey, now);

  const [defects, voiceReports, catalogueSize] = await Promise.all([
    fetchDefectsForDashboard(),
    // 6-month window is the longest; fetch enough rows to cover 2× that
    // for the delta calc. listQmReports caps at 100 internally.
    listQmReports({ limit: 100 }),
    fetchDefectCodeCatalogueSize(),
  ]);

  // --- Defects (count) -------------------------------------------------
  const defectsCur = rowsInRange(defects, cur.start, cur.end);
  const defectsPrev = rowsInRange(defects, prev.start, prev.end);
  const defectsSpark = bucketCounts(defectsCur, edges);
  const defectsDelta = computeDelta(
    defectsCur.length,
    defectsPrev.length,
    "lower-better",
  );

  // --- Defect Types (distinct codes) -----------------------------------
  const curTop = topCodes(defectsCur, 2);
  const distinctCur = new Set(
    defectsCur.map((r) => r.defect_code ?? "UNKNOWN"),
  ).size;
  const typesSecondary = curTop.length
    ? curTop.map((t) => `${t.code} ×${t.count}`).join(" · ")
    : "no codes observed";

  // --- Voice reports ---------------------------------------------------
  const voiceCur = voiceReports.filter((r) => {
    const t = new Date(r.receivedAt).getTime();
    return t >= cur.start && t < cur.end;
  });
  const voicePrev = voiceReports.filter((r) => {
    const t = new Date(r.receivedAt).getTime();
    return t >= prev.start && t < prev.end;
  });
  const needsTriage = voiceCur.filter((r) => !r.summaryShort).length;
  const voiceSpark = bucketVoiceReports(voiceCur, edges);
  const voiceDelta = computeDelta(
    voiceCur.length,
    voicePrev.length,
    "neutral",
  );
  const voiceSecondary =
    voiceCur.length === 0
      ? "no reports"
      : needsTriage > 0
        ? `${needsTriage} need triage`
        : "all triaged";

  // --- Cost ------------------------------------------------------------
  const costCur = defectsCur.reduce((s, r) => s + Number(r.cost ?? 0), 0);
  const costPrev = defectsPrev.reduce((s, r) => s + Number(r.cost ?? 0), 0);
  const costSpark = bucketCostSums(defectsCur, edges);
  const costDelta = computeDelta(costCur, costPrev, "lower-better");

  return (
    <section aria-label="Quality signals KPI strip" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-olive">
          Quality signals ·{" "}
          <span className="text-deep-olive">{WINDOW_LABEL[windowKey]}</span>
          <span
            className="ml-2 font-normal normal-case tracking-normal text-muted-olive/70"
            title={`Sparkline bucket: ${BUCKET_CONFIG[windowKey].shortLabel}`}
          >
            spark · {BUCKET_CONFIG[windowKey].shortLabel}
          </span>
        </div>
        <WindowTabs current={windowKey} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          label="Defects"
          value={defectsCur.length.toLocaleString()}
          secondary={null}
          delta={defectsDelta}
          sparkline={defectsSpark}
        />
        <KpiTile
          label="Defect types"
          value={
            catalogueSize > 0
              ? `${distinctCur} of ${catalogueSize}`
              : `${distinctCur}`
          }
          secondary={typesSecondary}
          delta={null}
          sparkline={null}
        />
        <KpiTile
          label="Voice reports"
          value={voiceCur.length.toLocaleString()}
          secondary={voiceSecondary}
          delta={voiceDelta}
          sparkline={voiceSpark}
        />
        <KpiTile
          label="Cost"
          value={formatEurShort(costCur)}
          secondary={null}
          delta={costDelta}
          sparkline={costSpark}
        />
      </div>
    </section>
  );
}

