import { manex } from "@/lib/manex";
import type {
  QmReportDetail,
  QmReportListItem,
  QmReportRaw,
} from "./types";
import { loadSummary } from "./store";

/**
 * Calls shorter than this are treated as mis-dials / hang-ups and
 * suppressed from every list view — they're not useful quality signals
 * and burning a summariser call on them pollutes the cache.
 */
const MIN_DURATION_SEC = 10;

/**
 * Fetch the latest voice reports from Manex's `qm_reports` table.
 *
 * `since` is optional — callers doing live-poll pass the ISO of the last
 * row they've already seen so the server returns only new rows; the UI
 * merges with its local list. `limit` caps the response.
 */
export async function listQmReports(opts: {
  since?: string | null;
  limit?: number;
} = {}): Promise<QmReportListItem[]> {
  const wanted = Math.min(100, Math.max(1, opts.limit ?? 25));
  const query: Record<string, string | number> = {
    order: "created_at.desc",
    // Over-fetch a bit so the post-filter (duration ≥ MIN_DURATION_SEC)
    // still leaves us with `wanted` rows in most cases.
    limit: String(Math.min(100, wanted * 3)),
  };
  if (opts.since) query.created_at = `gt.${opts.since}`;
  let rows: QmReportRaw[] = [];
  try {
    rows = await manex<QmReportRaw[]>("/qm_reports", query);
  } catch {
    return [];
  }

  // Drop mis-dials / hang-ups before any downstream work (summariser,
  // preview extraction, dashboard highlight).
  rows = rows.filter((r) => {
    const sec = parseDauer(r.dauer ?? "");
    return sec == null ? true : sec >= MIN_DURATION_SEC;
  });
  rows = rows.slice(0, wanted);

  const items = await Promise.all(
    rows.map(async (r): Promise<QmReportListItem> => {
      const summary = await loadSummary(r.id).catch(() => null);
      return {
        id: r.id,
        phone: r.telefonnummer ?? null,
        receivedAt: r.created_at,
        durationSec: parseDauer(r.dauer ?? ""),
        transcriptPreview: transcriptPreview(r.transcript ?? ""),
        hasTranscript: !!(r.transcript && r.transcript.trim().length > 0),
        summaryShort: summary?.summaryShort ?? null,
        facts: summary?.facts ?? null,
      };
    }),
  );
  return items;
}

export async function getQmReport(id: number): Promise<QmReportDetail | null> {
  let rows: QmReportRaw[] = [];
  try {
    rows = await manex<QmReportRaw[]>("/qm_reports", {
      id: `eq.${id}`,
      limit: 1,
    });
  } catch {
    return null;
  }
  const r = rows[0];
  if (!r) return null;
  const summary = await loadSummary(r.id).catch(() => null);
  return {
    id: r.id,
    phone: r.telefonnummer ?? null,
    receivedAt: r.created_at,
    durationSec: parseDauer(r.dauer ?? ""),
    transcript: r.transcript ?? "",
    summary,
  };
}

function parseDauer(raw: string): number | null {
  if (!raw) return null;
  const m = raw.match(/(?:(\d+)m)?\s*(?:(\d+)s)?/);
  if (!m) return null;
  const min = Number(m[1] ?? 0);
  const sec = Number(m[2] ?? 0);
  const total = min * 60 + sec;
  return Number.isFinite(total) ? total : null;
}

function transcriptPreview(raw: string): string {
  if (!raw) return "";
  // Drop the boilerplate Agent greeting so the preview shows the engineer's
  // actual complaint. Keep the first ~200 chars.
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const userSaid = lines.find((l) => /^user\s*:/i.test(l)) ?? lines[0] ?? "";
  return userSaid.replace(/^user\s*:\s*/i, "").slice(0, 200);
}
