import { NextResponse } from "next/server";
import { manex, type DefectDetail } from "@/lib/manex";

type Bucket = { code: string; count: number; cost: number };

/**
 * Pareto of defect codes, optionally filtered by time window or article.
 * Aggregation is client-side because PostgREST doesn't expose GROUP BY;
 * for hackathon volumes (~25 rows per story, ~thousands total) this is fine.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since"); // ISO date, e.g. 2026-01-01
  const article_id = searchParams.get("article_id") ?? undefined;

  const query: Record<string, string> = {
    select: "defect_code,cost,defect_ts",
    limit: "5000",
    order: "defect_ts.desc",
  };
  if (since) query["defect_ts"] = `gte.${since}`;
  if (article_id) query["article_id"] = `eq.${article_id}`;

  try {
    const rows = await manex<DefectDetail[]>("/v_defect_detail", query);
    const map = new Map<string, Bucket>();
    for (const r of rows) {
      const code = r.defect_code ?? "UNKNOWN";
      const b = map.get(code) ?? { code, count: 0, cost: 0 };
      b.count += 1;
      b.cost += Number(r.cost ?? 0);
      map.set(code, b);
    }
    const sorted = [...map.values()].sort((a, b) => b.count - a.count);
    const total = sorted.reduce((s, b) => s + b.count, 0);
    let running = 0;
    const buckets = sorted.map((b) => {
      running += b.count;
      return {
        ...b,
        share: total ? b.count / total : 0,
        cumShare: total ? running / total : 0,
      };
    });

    return NextResponse.json({ total, buckets });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
