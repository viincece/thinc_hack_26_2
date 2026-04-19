import { safeSelect } from "@/lib/db";
import { manex } from "@/lib/manex";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import type {
  ArticleSummary,
  FmeaCell,
  FmeaDoc,
  FmeaRow,
  FmeaStatus,
} from "./types";
import { newFmeaId, saveFmea } from "./store";

/* -------------------------------------------------------------- *
 *  Article picker — list articles with 6-month defect counts so
 *  the modal can rank them by "most active".
 * -------------------------------------------------------------- */

export async function listArticlesForFmea(): Promise<ArticleSummary[]> {
  // Defect counts per article, joined from the flat `defect` table.
  let counts: Record<
    string,
    {
      defects6mo: number;
      criticalDefects6mo: number;
      lastDefectAt: string | null;
    }
  > = {};
  try {
    const { rows } = await safeSelect(`
      SELECT p.article_id,
             COUNT(*)::int AS n,
             SUM(CASE WHEN d.severity = 'critical' THEN 1 ELSE 0 END)::int AS crit,
             MAX(d.ts)::text AS last_ts
        FROM defect d
        JOIN product p ON p.product_id = d.product_id
       WHERE d.ts >= NOW() - INTERVAL '6 months'
       GROUP BY p.article_id
    `);
    const typed = rows as Array<{
      article_id: string;
      n: number;
      crit: number;
      last_ts: string | null;
    }>;
    for (const r of typed) {
      counts[r.article_id] = {
        defects6mo: Number(r.n ?? 0),
        criticalDefects6mo: Number(r.crit ?? 0),
        lastDefectAt: r.last_ts,
      };
    }
  } catch {
    counts = {};
  }

  // Every article + its BOM size.
  // NB: the raw `article` table exposes the display name as `name`
  //     (the `v_defect_detail` view renames it to `article_name`).
  //     We request the raw column and normalise into `article_name`
  //     for the rest of the app.
  let articles: Array<{
    article_id: string;
    article_name: string | null;
    commodity: string | null;
  }> = [];
  try {
    const raw = await manex<Array<{ article_id: string; name?: string }>>(
      "/article",
      {
        select: "article_id,name",
        order: "article_id.asc",
        limit: 200,
      },
    );
    articles = raw.map((a) => ({
      article_id: a.article_id,
      article_name: a.name ?? null,
      commodity: null, // not exposed on the raw article table
    }));
  } catch {
    articles = [];
  }

  // BOM size per article — via the `bom` + `bom_node` tables.
  let bomSizeByArticle: Record<string, number> = {};
  try {
    const { rows } = await safeSelect(`
      SELECT b.article_id, COUNT(*)::int AS n
        FROM bom_node bn
        JOIN bom b ON b.bom_id = bn.bom_id
       GROUP BY b.article_id
    `);
    for (const r of rows as Array<{ article_id: string; n: number }>) {
      bomSizeByArticle[r.article_id] = Number(r.n ?? 0);
    }
  } catch {
    bomSizeByArticle = {};
  }

  const out: ArticleSummary[] = articles.map((a) => ({
    article_id: a.article_id,
    article_name: a.article_name ?? null,
    commodity: a.commodity ?? null,
    bomSize: bomSizeByArticle[a.article_id] ?? 0,
    defects6mo: counts[a.article_id]?.defects6mo ?? 0,
    criticalDefects6mo: counts[a.article_id]?.criticalDefects6mo ?? 0,
    lastDefectAt: counts[a.article_id]?.lastDefectAt ?? null,
  }));

  // Most-active first — rows with the same count are stable-sorted.
  out.sort((a, b) => b.defects6mo - a.defects6mo);
  return out;
}

/* -------------------------------------------------------------- *
 *  Generator — build an FMEA draft for one article and persist it.
 * -------------------------------------------------------------- */

export async function generateFmeaForArticle(
  articleId: string,
  opts: { productName?: string; createdBy?: string } = {},
): Promise<FmeaDoc> {
  // 1. Anchor — article + its BOM components.
  const article = await fetchArticle(articleId);
  const components = await fetchBomComponents(articleId);

  // 2. For each component, pull defect counts by code and test-gate
  //    coverage. One round-trip over the view is cheaper than one
  //    query per row, so we bulk-load.
  const defectsByComponent = await fetchDefectsByComponent(articleId);
  const claimsByArticle = await fetchClaimsByArticle(articleId);
  const testsByPart = await fetchTestsByPart(articleId);
  const detectionByTestKey = await fetchDetectionByTestKey();

  // 3. Build one row per (component, defect_code). If a component has
  //    no history, emit a single "suggested" row so the engineer isn't
  //    missing the component entirely.
  const rows: FmeaRow[] = [];
  for (const c of components) {
    const defects = defectsByComponent[c.part_number] ?? [];
    if (defects.length === 0) {
      rows.push(synthSuggestedRow(c));
      continue;
    }
    for (const d of defects.slice(0, 3)) {
      rows.push(
        buildRow(c, d, {
          claims: claimsByArticle,
          tests: testsByPart[c.part_number] ?? [],
          detection: detectionByTestKey,
        }),
      );
    }
  }

  // 4. LLM narrative pass — fills Effects / Causes / Prevention /
  //    Detection / Recommended cells. Deterministic scores (S/O/D) are
  //    kept untouched by the LLM.
  try {
    await enrichWithLlm(rows, article?.article_name ?? articleId);
  } catch {
    /* non-fatal — cells stay as whatever the deterministic pass set */
  }

  // 5. Compute RPN + sort by RPN descending.
  for (const r of rows) r.rpn = rpn(r);
  rows.sort((a, b) => b.rpn - a.rpn);

  const id = newFmeaId();
  const today = new Date().toISOString().slice(0, 10);
  const doc: FmeaDoc = {
    id,
    name: `${article?.article_name ?? articleId} — FMEA`,
    generatedAt: new Date().toISOString(),
    source: {
      articleId,
      articleName: article?.article_name ?? undefined,
      bomId: article?.bom_id ?? undefined,
    },
    header: {
      kind: "Design",
      modelSystem: article?.article_name ?? articleId,
      productName: article?.article_name ?? "",
      productNumber: articleId,
      revision: "",
      createdBy: opts.createdBy ?? "",
      revisedBy: "",
      createdAt: today,
      effortHours: null,
      responsible: "",
    },
    rows,
  };
  await saveFmea(doc);
  return doc;
}

/* -------------------------------------------------------------- *
 *  DB helpers
 * -------------------------------------------------------------- */

function safeLit(s: string): string {
  return (s ?? "").replace(/'/g, "''").replace(/[;\\]/g, "");
}

type Article = {
  article_id: string;
  article_name?: string;
  bom_id?: string;
};
type Component = {
  part_number: string;
  find_number: string | null;
  part_title: string | null;
  commodity: string | null;
  qty: number | null;
  bom_node_id: string;
};

async function fetchArticle(articleId: string): Promise<Article | null> {
  try {
    const rows = await manex<
      Array<{ article_id: string; name?: string; bom_id?: string }>
    >("/article", {
      article_id: `eq.${articleId}`,
      select: "article_id,name,bom_id",
      limit: 1,
    });
    const r = rows[0];
    if (!r) return null;
    return {
      article_id: r.article_id,
      article_name: r.name,
      bom_id: r.bom_id,
    };
  } catch {
    return null;
  }
}

async function fetchBomComponents(articleId: string): Promise<Component[]> {
  try {
    const { rows } = await safeSelect(`
      SELECT bn.bom_node_id,
             bn.part_number,
             bn.find_number,
             bn.qty,
             pm.title    AS part_title,
             pm.commodity
        FROM bom_node bn
        JOIN bom       b  ON b.bom_id = bn.bom_id
        LEFT JOIN part_master pm ON pm.part_number = bn.part_number
       WHERE b.article_id = '${safeLit(articleId)}'
         AND bn.part_number IS NOT NULL
       ORDER BY bn.find_number NULLS LAST, bn.part_number
       LIMIT 80
    `);
    return rows as Component[];
  } catch {
    return [];
  }
}

type DefectAgg = {
  defect_code: string;
  n: number;
  severity_max: "low" | "medium" | "high" | "critical";
  last_ts: string | null;
  total_cost: number;
};

async function fetchDefectsByComponent(
  articleId: string,
): Promise<Record<string, DefectAgg[]>> {
  try {
    const { rows } = await safeSelect(`
      SELECT d.reported_part_number AS part_number,
             d.defect_code,
             COUNT(*)::int AS n,
             MAX(
               CASE d.severity
                 WHEN 'critical' THEN 4
                 WHEN 'high'     THEN 3
                 WHEN 'medium'   THEN 2
                 WHEN 'low'      THEN 1
                 ELSE 0
               END
             ) AS sev_rank,
             MAX(d.ts)::text AS last_ts,
             COALESCE(SUM(d.cost), 0)::float AS total_cost
        FROM defect d
        JOIN product p ON p.product_id = d.product_id
       WHERE p.article_id = '${safeLit(articleId)}'
         AND d.ts >= NOW() - INTERVAL '6 months'
         AND d.reported_part_number IS NOT NULL
       GROUP BY d.reported_part_number, d.defect_code
       ORDER BY d.reported_part_number, COUNT(*) DESC
    `);
    const out: Record<string, DefectAgg[]> = {};
    const rankToSev: Record<number, DefectAgg["severity_max"]> = {
      4: "critical",
      3: "high",
      2: "medium",
      1: "low",
      0: "low",
    };
    for (const r of rows as Array<{
      part_number: string;
      defect_code: string;
      n: number;
      sev_rank: number;
      last_ts: string | null;
      total_cost: number;
    }>) {
      (out[r.part_number] ??= []).push({
        defect_code: r.defect_code,
        n: Number(r.n ?? 0),
        severity_max: rankToSev[r.sev_rank] ?? "low",
        last_ts: r.last_ts,
        total_cost: Number(r.total_cost ?? 0),
      });
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchClaimsByArticle(
  articleId: string,
): Promise<{ n: number; sampleText?: string }> {
  try {
    const { rows } = await safeSelect(`
      SELECT COUNT(*)::int AS n,
             MAX(complaint_text) AS sample
        FROM field_claim fc
        JOIN product p ON p.product_id = fc.product_id
       WHERE p.article_id = '${safeLit(articleId)}'
         AND fc.claim_ts >= NOW() - INTERVAL '12 months'
    `);
    const r = rows[0] as { n?: number; sample?: string } | undefined;
    return { n: Number(r?.n ?? 0), sampleText: r?.sample ?? undefined };
  } catch {
    return { n: 0 };
  }
}

async function fetchTestsByPart(
  articleId: string,
): Promise<Record<string, Array<{ test_key: string; title: string | null }>>> {
  try {
    const { rows } = await safeSelect(`
      SELECT DISTINCT bn.part_number, t.test_id, t.title
        FROM bom_node bn
        JOIN bom b ON b.bom_id = bn.bom_id
        JOIN test t ON t.part_number = bn.part_number
       WHERE b.article_id = '${safeLit(articleId)}'
    `);
    const out: Record<
      string,
      Array<{ test_key: string; title: string | null }>
    > = {};
    for (const r of rows as Array<{
      part_number: string;
      test_id: string;
      title: string | null;
    }>) {
      (out[r.part_number] ??= []).push({
        test_key: r.test_id,
        title: r.title ?? null,
      });
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchDetectionByTestKey(): Promise<
  Record<string, { pass: number; fail: number }>
> {
  try {
    const { rows } = await safeSelect(`
      SELECT test_key,
             SUM(CASE WHEN overall_result = 'PASS'     THEN 1 ELSE 0 END)::int AS pass,
             SUM(CASE WHEN overall_result = 'FAIL'     THEN 1 ELSE 0 END)::int AS fail
        FROM test_result
       WHERE ts >= NOW() - INTERVAL '6 months'
       GROUP BY test_key
    `);
    const out: Record<string, { pass: number; fail: number }> = {};
    for (const r of rows as Array<{
      test_key: string;
      pass: number;
      fail: number;
    }>) {
      out[r.test_key] = {
        pass: Number(r.pass ?? 0),
        fail: Number(r.fail ?? 0),
      };
    }
    return out;
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------- *
 *  Row builders
 * -------------------------------------------------------------- */

function cell<T>(
  value: T | null,
  status: FmeaStatus,
  source?: string,
  note?: string,
): FmeaCell<T> {
  return { value, status, source, note };
}

function scoreSeverity(sev: DefectAgg["severity_max"], hasClaims: boolean): number {
  // AIAG-ish: low=3, medium=5, high=7, critical=9; +1 when a customer
  // has filed a claim (escalates the "end-user perceives" factor).
  const base = sev === "critical" ? 9 : sev === "high" ? 7 : sev === "medium" ? 5 : 3;
  return Math.min(10, base + (hasClaims ? 1 : 0));
}

function scoreOccurrence(count6mo: number): number {
  // Rough AIAG mapping: 0→1, 1-2→3, 3-5→5, 6-12→7, 13-25→8, 26-60→9, >60→10.
  if (count6mo <= 0) return 1;
  if (count6mo <= 2) return 3;
  if (count6mo <= 5) return 5;
  if (count6mo <= 12) return 7;
  if (count6mo <= 25) return 8;
  if (count6mo <= 60) return 9;
  return 10;
}

function scoreDetection(
  tests: Array<{ test_key: string; title: string | null }>,
  detection: Record<string, { pass: number; fail: number }>,
): { score: number; status: FmeaStatus; source?: string } {
  if (tests.length === 0) {
    return { score: 9, status: "suggested" }; // no gate → high D
  }
  let best = 0;
  let evidence: string[] = [];
  for (const t of tests) {
    const stats = detection[t.test_key];
    if (!stats) continue;
    const total = stats.pass + stats.fail;
    if (total === 0) continue;
    const failRate = stats.fail / total;
    best = Math.max(best, failRate);
    evidence.push(t.test_key);
  }
  if (best <= 0) return { score: 7, status: "suggested" };
  // Higher fail-rate on this key → the gate catches the problem → lower D.
  const score =
    best >= 0.2 ? 2 : best >= 0.1 ? 4 : best >= 0.03 ? 6 : 8;
  return { score, status: "grounded", source: evidence.join(", ") };
}

function buildRow(
  c: Component,
  d: DefectAgg,
  ctx: {
    claims: { n: number; sampleText?: string };
    tests: Array<{ test_key: string; title: string | null }>;
    detection: Record<string, { pass: number; fail: number }>;
  },
): FmeaRow {
  const elementFunctionValue = [c.part_title, c.find_number ? `(${c.find_number})` : null]
    .filter(Boolean)
    .join(" ");
  const elementFunction = cell<string>(
    elementFunctionValue || c.part_number,
    "grounded",
    `PM=${c.part_number}${c.bom_node_id ? ", " + c.bom_node_id : ""}`,
  );
  const failureMode = cell<string>(d.defect_code, "grounded", `${d.n} past defects`);
  const hasClaims = ctx.claims.n > 0;
  const effects = ctx.claims.sampleText
    ? cell<string>(
        ctx.claims.sampleText.slice(0, 160),
        "grounded",
        `field_claim sample (${ctx.claims.n} total on article)`,
      )
    : cell<string>(null, "needs_input", undefined, "Describe the failure's impact on the customer.");
  const severity = cell<number>(
    scoreSeverity(d.severity_max, hasClaims),
    "grounded",
    `severity_max=${d.severity_max}, claims=${ctx.claims.n}`,
  );
  const causes = cell<string>(
    null,
    "needs_input",
    undefined,
    "Confirm the root cause — consult the KG or past 8D reports.",
  );
  const occurrence = cell<number>(
    scoreOccurrence(d.n),
    "grounded",
    `${d.n} defects in last 6 months`,
  );
  const prevention = cell<string>(
    null,
    "needs_input",
    undefined,
    "List the in-line controls that should keep this from occurring.",
  );
  const detScore = scoreDetection(ctx.tests, ctx.detection);
  const detection = cell<string>(
    ctx.tests.length > 0
      ? ctx.tests.map((t) => t.title ?? t.test_key).join(" · ")
      : null,
    ctx.tests.length > 0 ? "grounded" : "needs_input",
    ctx.tests.length > 0
      ? ctx.tests.map((t) => t.test_key).join(", ")
      : undefined,
    ctx.tests.length > 0 ? undefined : "No test gate covers this part yet.",
  );
  const detectionScore = cell<number>(detScore.score, detScore.status, detScore.source);
  const recommendedActions = cell<string>(
    null,
    "needs_input",
    undefined,
    "Recommend a corrective action; reference past 8D or initiatives.",
  );
  const responsibility = cell<string>(null, "needs_input", undefined, "Assign an owner.");
  const dueDate = cell<string>(null, "needs_input", undefined, "Pick a realistic due date.");
  const actionsTaken = cell<string>(null, "needs_input", undefined, "Updated once the action is in place.");

  return {
    id: `${c.bom_node_id}__${d.defect_code}`,
    bomNodeId: c.bom_node_id,
    partNumber: c.part_number,
    findNumber: c.find_number ?? undefined,
    elementFunction,
    failureMode,
    effects,
    severity,
    causes,
    occurrence,
    prevention,
    detection,
    detectionScore,
    rpn: 0, // filled later
    recommendedActions,
    responsibility,
    dueDate,
    actionsTaken,
  };
}

function synthSuggestedRow(c: Component): FmeaRow {
  const elementFunction = cell<string>(
    [c.part_title, c.find_number ? `(${c.find_number})` : null]
      .filter(Boolean)
      .join(" ") || c.part_number,
    "grounded",
    `PM=${c.part_number}`,
  );
  const failureMode = cell<string>(
    null,
    "needs_input",
    undefined,
    `No historical defects on ${c.part_number} in the last 6 months — fill the failure mode from knowledge of similar components.`,
  );
  return {
    id: `${c.bom_node_id}__unknown`,
    bomNodeId: c.bom_node_id,
    partNumber: c.part_number,
    findNumber: c.find_number ?? undefined,
    elementFunction,
    failureMode,
    effects: cell<string>(null, "needs_input", undefined, "Describe the failure's impact."),
    severity: cell<number>(3, "suggested", "no historical data"),
    causes: cell<string>(null, "needs_input", undefined, "Consult the KG for common failure modes."),
    occurrence: cell<number>(1, "grounded", "0 defects in last 6 months"),
    prevention: cell<string>(null, "needs_input", undefined, "List preventive controls."),
    detection: cell<string>(null, "needs_input", undefined, "List detection controls."),
    detectionScore: cell<number>(5, "suggested", "no coverage data"),
    rpn: 0,
    recommendedActions: cell<string>(null, "needs_input", undefined, "Recommend actions."),
    responsibility: cell<string>(null, "needs_input", undefined, "Assign an owner."),
    dueDate: cell<string>(null, "needs_input"),
    actionsTaken: cell<string>(null, "needs_input"),
  };
}

function rpn(r: FmeaRow): number {
  const s = r.severity.value ?? 0;
  const o = r.occurrence.value ?? 0;
  const d = r.detectionScore.value ?? 0;
  return Math.max(0, Math.min(1000, s * o * d));
}

/* -------------------------------------------------------------- *
 *  LLM enrichment — only writes cells that are still needs_input,
 *  and only if the model returns a non-empty, schema-shaped reply.
 * -------------------------------------------------------------- */

async function enrichWithLlm(rows: FmeaRow[], articleLabel: string) {
  if (rows.length === 0) return;
  // Limit the LLM work to the top 12 rows (by pre-enrichment RPN
  // using S and O; D is usually a suggested default). This caps token
  // spend and keeps the feature snappy.
  const preRanked = [...rows].sort((a, b) => {
    const bSev = (b.severity.value ?? 0) * (b.occurrence.value ?? 0);
    const aSev = (a.severity.value ?? 0) * (a.occurrence.value ?? 0);
    return bSev - aSev;
  });
  const focus = preRanked.slice(0, 12);

  const prompt = `You are a quality engineer drafting a Design FMEA for the article "${articleLabel}".
For each FMEA row below, return JSON with concise professional German+English phrasing.

Rules:
- NEVER invent part numbers, IDs, or quantities.
- Focus on the \`failureMode\` given — describe plausible effects, causes, prevention controls, and detection methods for that specific failure on that specific component.
- Keep each string ≤ 160 chars.
- "recommendedActions" should propose ONE concrete step. Avoid clichés like "training and awareness".

Return strict JSON:
{
  "rows": [
    { "id": "<row id>", "effects": string, "causes": string, "prevention": string, "recommendedActions": string }
  ]
}

Rows:
${focus
  .map((r, i) =>
    `${i + 1}. id=${r.id}
   part=${r.partNumber ?? "?"} (${r.findNumber ?? "?"}) · ${r.elementFunction.value ?? ""}
   failure=${r.failureMode.value ?? "(unknown)"}
   severity=${r.severity.value ?? "?"} · occurrence=${r.occurrence.value ?? "?"}`,
  )
  .join("\n")}`;

  const client = anthropic();
  const resp = await client.messages.create({
    model: AGENT_MODEL,
    max_tokens: 2200,
    messages: [{ role: "user", content: prompt }],
  });
  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const parsed = safeParseLlm(text);
  if (!parsed) return;

  const byId = new Map(rows.map((r) => [r.id, r] as const));
  for (const row of parsed.rows ?? []) {
    const target = byId.get(row.id);
    if (!target) continue;
    applyIfEmpty(target, "effects", row.effects);
    applyIfEmpty(target, "causes", row.causes);
    applyIfEmpty(target, "prevention", row.prevention);
    applyIfEmpty(target, "recommendedActions", row.recommendedActions);
  }
}

type LlmRow = {
  id: string;
  effects?: string;
  causes?: string;
  prevention?: string;
  recommendedActions?: string;
};
function safeParseLlm(text: string): { rows?: LlmRow[] } | null {
  const stripped = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const a = stripped.indexOf("{");
    const b = stripped.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(stripped.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function applyIfEmpty(
  row: FmeaRow,
  key: "effects" | "causes" | "prevention" | "recommendedActions",
  value: unknown,
) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  const current = row[key];
  if (current.status === "grounded" && current.value) return; // keep DB-grounded
  row[key] = {
    value: trimmed,
    status: "suggested",
    source: "LLM inference from component + failure mode",
  };
}
