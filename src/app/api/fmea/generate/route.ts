import { NextResponse } from "next/server";
import { generateFmeaForArticle } from "@/lib/fmea/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { articleId?: string; createdBy?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.articleId) {
    return NextResponse.json({ error: "articleId required" }, { status: 400 });
  }
  try {
    const doc = await generateFmeaForArticle(body.articleId, {
      createdBy: body.createdBy,
    });
    return NextResponse.json({ ok: true, id: doc.id, rowCount: doc.rows.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
