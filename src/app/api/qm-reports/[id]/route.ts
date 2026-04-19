import { NextResponse } from "next/server";
import { getQmReport } from "@/lib/qm-reports/manex";
import { extractAndSaveSummary } from "@/lib/qm-reports/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/qm-reports/<id> — return the full transcript + cached
 * summary. If no summary exists yet we generate one on the spot so the
 * subpage never opens with a perpetually-missing card.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const detail = await getQmReport(n);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!detail.summary && detail.transcript.trim().length > 0) {
    try {
      const summary = await extractAndSaveSummary(n);
      if (summary) detail.summary = summary;
    } catch {
      /* keep detail.summary null — the client renders a "summarise" button */
    }
  }
  return NextResponse.json({ report: detail });
}
