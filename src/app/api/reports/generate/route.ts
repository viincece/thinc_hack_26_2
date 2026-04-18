import { NextResponse } from "next/server";
import { generateReportFromDraft } from "@/lib/reports/generate";
import { saveReport } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { draftId?: string };
  try {
    body = (await req.json()) as { draftId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.draftId) {
    return NextResponse.json({ error: "draftId required" }, { status: 400 });
  }
  try {
    const report = await generateReportFromDraft(body.draftId);
    const summary = await saveReport(report);
    return NextResponse.json({ ok: true, report: summary, id: report.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
