import { NextResponse } from "next/server";
import { listFmeas } from "@/lib/fmea/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const fmeas = await listFmeas();
    return NextResponse.json({ fmeas });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
