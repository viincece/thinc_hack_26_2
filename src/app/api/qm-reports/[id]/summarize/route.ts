import { NextResponse } from "next/server";
import { extractAndSaveSummary } from "@/lib/qm-reports/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Force a fresh summary pass over the transcript. Overwrites the cached
 * JSON. Separate from GET so the subpage's "Regenerate summary" button
 * is explicit about the side effect (and the LLM cost).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  try {
    const summary = await extractAndSaveSummary(n);
    if (!summary) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
