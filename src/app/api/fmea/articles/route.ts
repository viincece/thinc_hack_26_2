import { NextResponse } from "next/server";
import { listArticlesForFmea } from "@/lib/fmea/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const articles = await listArticlesForFmea();
    return NextResponse.json({ articles });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
