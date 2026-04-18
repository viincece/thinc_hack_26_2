import { env } from "./env";

/**
 * Thin wrapper over the Manex PostgREST API.
 *
 * Usage:
 *   manex("/v_defect_detail", { defect_code: "eq.SOLDER_COLD", limit: "20" })
 *
 * Only import this module from the server (Route Handlers, Server Components,
 * Server Actions). It reads MANEX_API_KEY from the process env and will throw
 * if called from the browser.
 */
export async function manex<T = unknown>(
  path: string,
  query: Record<string, string | number | undefined> = {},
  init: RequestInit = {},
): Promise<T> {
  const url = new URL(path, env.manexApiUrl());
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.manexApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    // PostgREST responses are live quality data — do not cache by default.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Manex ${init.method ?? "GET"} ${path} failed: ${res.status} ${body}`,
    );
  }
  return (await res.json()) as T;
}

/* ---------- Row types (subset of schema) -------------------------------- */

export type DefectRow = {
  defect_id: string;
  product_id: string;
  ts: string;
  source_type: string;
  defect_code: string;
  severity: "low" | "medium" | "high" | "critical";
  detected_section_id: string | null;
  occurrence_section_id: string | null;
  detected_test_result_id: string | null;
  reported_part_number: string | null;
  image_url: string | null;
  cost: number | null;
  notes: string | null;
};

export type DefectDetail = DefectRow & {
  article_id?: string;
  article_name?: string;
  occurrence_section_name?: string | null;
  detected_section_name?: string | null;
  reported_part_title?: string | null;
};

export type FieldClaimRow = {
  field_claim_id: string;
  product_id: string;
  claim_ts: string;
  market: string | null;
  complaint_text: string;
  reported_part_number: string | null;
  image_url: string | null;
  cost: number | null;
  mapped_defect_id: string | null;
  notes: string | null;
};

export type ProductActionRow = {
  action_id: string;
  product_id: string;
  ts: string;
  action_type: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  user_id: string;
  section_id: string | null;
  comments: string | null;
  defect_id: string | null;
};
