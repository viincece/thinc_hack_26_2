import { NextResponse } from "next/server";
import { loadFmea, saveFmea } from "@/lib/fmea/store";
import type { FmeaDoc } from "@/lib/fmea/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Overwrite an existing FMEA draft's JSON with a client-edited copy.
 * Guards against id drift — the on-disk id wins.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { doc?: FmeaDoc } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.doc) {
    return NextResponse.json({ error: "doc required" }, { status: 400 });
  }

  const existing = await loadFmea(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const next: FmeaDoc = {
    ...body.doc,
    id: existing.id,                // ignore client id edits
    generatedAt: existing.generatedAt, // preserve original creation
    source: existing.source,        // never let the UI mutate the anchor
  };

  try {
    const summary = await saveFmea(next);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
