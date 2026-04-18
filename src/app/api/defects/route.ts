import { NextResponse } from "next/server";
import { manex, type DefectDetail } from "@/lib/manex";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") ?? "50";
  const defect_code = searchParams.get("defect_code") ?? undefined;
  const severity = searchParams.get("severity") ?? undefined;
  const article_id = searchParams.get("article_id") ?? undefined;

  const query: Record<string, string> = {
    order: "defect_ts.desc",
    limit,
  };
  if (defect_code) query["defect_code"] = `eq.${defect_code}`;
  if (severity) query["severity"] = `eq.${severity}`;
  if (article_id) query["article_id"] = `eq.${article_id}`;

  try {
    const rows = await manex<DefectDetail[]>("/v_defect_detail", query);
    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
