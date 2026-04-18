import { NextResponse } from "next/server";
import { listDrafts, saveDraft } from "@/lib/drafts";
import type { EightDDoc, FieldMetaMap } from "@/components/copilot/eight-d-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const drafts = await listDrafts();
    return NextResponse.json({ drafts });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type SaveBody = {
  id?: string;
  name?: string;
  doc: EightDDoc;
  meta: FieldMetaMap;
};

export async function POST(req: Request) {
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.doc || typeof body.doc !== "object") {
    return NextResponse.json({ error: "doc is required" }, { status: 400 });
  }
  try {
    const record = await saveDraft({
      id: body.id,
      name: body.name,
      doc: body.doc,
      meta: body.meta ?? {},
    });
    return NextResponse.json({ ok: true, draft: record });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
