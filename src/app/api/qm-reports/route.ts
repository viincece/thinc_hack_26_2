import { NextResponse } from "next/server";
import { listQmReports } from "@/lib/qm-reports/manex";
import { extractAndSaveSummary } from "@/lib/qm-reports/extract";
import { loadSummary } from "@/lib/qm-reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * List of voice-reported incidents.
 *
 * Query params:
 *   since=<ISO>  — only return rows created after this instant (poll diff)
 *   limit=<n>    — max rows returned (capped at 100, default 25)
 *
 * Side effect: any row that comes back without a cached summary is
 * summarised in the background so that by the time the engineer clicks
 * it, the subpage shows content without a spinner. We don't block the
 * response on that work — the client poll will see the summary on the
 * next refresh.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const limit = Number(url.searchParams.get("limit") ?? 25);

  const items = await listQmReports({
    since: since && since.length > 0 ? since : null,
    limit: Number.isFinite(limit) ? limit : 25,
  });

  // Kick off summarisation for any row we haven't cached yet. Fire-and-
  // forget — the poll will pick it up on the next tick.
  for (const item of items) {
    if (item.summaryShort == null && item.hasTranscript) {
      void summariseIfMissing(item.id);
    }
  }

  return NextResponse.json({ items });
}

async function summariseIfMissing(id: number) {
  const existing = await loadSummary(id).catch(() => null);
  if (existing) return;
  try {
    await extractAndSaveSummary(id);
  } catch {
    /* swallow — the engineer can still hit "Regenerate" manually */
  }
}
