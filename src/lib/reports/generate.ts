import { manex, type DefectDetail, type FieldClaimRow } from "@/lib/manex";
import { safeSelect } from "@/lib/db";
import { hybridSearch, observationsAbout } from "@/lib/kg/query";
import { loadDraft } from "@/lib/drafts";
import type { DraftFile } from "@/lib/drafts";
import { newReportId } from "./store";
import type {
  BomTreeNode,
  CostScore,
  CostTimelineBucket,
  FaultNode,
  IncidentReport,
  OpenInitiative,
  PreventionStep,
  ReportFacts,
  ResolutionStats,
  RiskBand,
  RiskScore,
  SimilarIncident,
  TimelineEvent,
} from "./types";

/* -------------------------------------------------------------- *
 *  Helpers: dig defect_id out of a saved 8D draft.
 * -------------------------------------------------------------- */

function guessDefectId(draft: DraftFile): string | undefined {
  // The 8D doc doesn't have a typed slot for defect_id, but evidence ids
  // are sprinkled through the `meta.source` field. Scan the whole meta
  // map for the first DEF-… token.
  for (const m of Object.values(draft.meta ?? {})) {
    const src = m?.source;
    if (!src) continue;
    const hit = /\bDEF-\d{5}\b/.exec(src);
    if (hit) return hit[0];
  }
  // Also scan problem text and appreciation.
  const text = `${draft.doc?.problem ?? ""} ${draft.doc?.appreciation ?? ""}`;
  const hit = /\bDEF-\d{5}\b/.exec(text);
  return hit?.[0];
}

/* -------------------------------------------------------------- *
 *  Fact extraction from DB + KG.
 * -------------------------------------------------------------- */

async function factsFor(
  defectId: string | undefined,
  articleId: string | undefined,
): Promise<{ facts: ReportFacts; defect?: DefectDetail }> {
  if (!defectId) {
    return {
      facts: {
        article_id: articleId,
        similar_count: 0,
        field_claims_count: 0,
      },
    };
  }
  const rows = await manex<
    Array<DefectDetail & { defect_ts?: string; product_build_ts?: string }>
  >("/v_defect_detail", {
    defect_id: `eq.${defectId}`,
    limit: 1,
  });
  const d = rows[0];
  if (!d) {
    return {
      facts: {
        defect_id: defectId,
        article_id: articleId,
        similar_count: 0,
        field_claims_count: 0,
      },
    };
  }

  // Similar incidents (same defect_code on any product, last 12 weeks).
  let similar_count = 0;
  try {
    const { rows: sim } = await safeSelect(`
      SELECT COUNT(*)::int AS n FROM defect
       WHERE defect_code = '${safeLit(d.defect_code)}'
         AND ts >= NOW() - INTERVAL '84 days'
         AND defect_id <> '${safeLit(d.defect_id)}'
    `);
    similar_count = Number((sim[0] as { n?: number })?.n ?? 0);
  } catch {
    /* non-fatal */
  }

  // Field claims on the same product or same reported part.
  let field_claims_count = 0;
  try {
    const rowsFC = await manex<FieldClaimRow[]>("/field_claim", {
      product_id: `eq.${d.product_id}`,
      limit: 100,
    });
    field_claims_count = rowsFC.length;
  } catch {
    /* non-fatal */
  }

  // Supplier batch of the reported part, if installed.
  let supplier_batch_id: string | undefined;
  let supplier_name: string | undefined;
  try {
    const { rows: bom } = await safeSelect(`
      SELECT supplier_batch_id, supplier_name
        FROM v_product_bom_parts
       WHERE product_id = '${safeLit(d.product_id)}'
         AND (part_number = '${safeLit(d.reported_part_number ?? "")}'
              OR find_number = '${safeLit(d.reported_part_number ?? "")}')
       LIMIT 1
    `);
    const r = bom[0] as { supplier_batch_id?: string; supplier_name?: string } | undefined;
    supplier_batch_id = r?.supplier_batch_id;
    supplier_name = r?.supplier_name;
  } catch {
    /* non-fatal */
  }

  // First linked rework — gives a human action text.
  let rework_text: string | undefined;
  let rework_user: string | undefined;
  try {
    const { rows: rw } = await safeSelect(`
      SELECT action_text, user_id FROM rework
       WHERE defect_id = '${safeLit(d.defect_id)}' LIMIT 1
    `);
    const r = rw[0] as { action_text?: string; user_id?: string } | undefined;
    rework_text = r?.action_text;
    rework_user = r?.user_id;
  } catch {
    /* non-fatal */
  }

  return {
    defect: d,
    facts: {
      defect_id: d.defect_id,
      defect_code: d.defect_code,
      severity: d.severity,
      article_id: d.article_id,
      article_name: d.article_name ?? undefined,
      product_id: d.product_id,
      reported_part_number: d.reported_part_number ?? undefined,
      reported_part_title: d.reported_part_title ?? undefined,
      supplier_batch_id,
      supplier_name,
      occurrence_section_name: d.occurrence_section_name,
      detected_section_name: d.detected_section_name,
      cost_eur: d.cost,
      // v_defect_detail exposes the defect timestamp as `defect_ts`; the
      // flat `defect` table uses `ts`. Accept either so this stays robust
      // regardless of which query path we ever land on.
      ts: d.defect_ts ?? d.ts,
      notes: d.notes ?? undefined,
      rework_text,
      rework_user,
      similar_count,
      field_claims_count,
    },
  };
}

/* -------------------------------------------------------------- *
 *  Fault tree — built from observable DB rows.
 *
 *  The previous version leaned on KG hybrid search, which produced empty
 *  "No linked evidence" cards whenever the graph didn't already know the
 *  defect. We now derive branches from concrete Manex rows the engineer
 *  can click through to (supplier batch, rework, test result, section,
 *  operator). Each branch is only added when there IS a row; if a KG
 *  concept does match on top of all that, we surface it as an extra
 *  "Historical pattern" branch so prior cases still show.
 * -------------------------------------------------------------- */

function confidenceFor(score: number): "high" | "medium" | "low" {
  if (score >= 0.75) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

async function buildFaultTree(
  facts: ReportFacts,
  problemText: string,
): Promise<FaultNode> {
  const root: FaultNode = {
    id: "root",
    kind: "defect",
    label: facts.defect_code
      ? `${facts.defect_code} on ${facts.article_name ?? facts.article_id ?? "part"}`
      : "Observed defect",
    detail: facts.notes ?? facts.rework_text,
    children: [],
  };

  // -- Material: supplier batch + part master ----------------------
  if (facts.supplier_batch_id || facts.reported_part_number) {
    const material: FaultNode = {
      id: "cat_Material",
      kind: "category",
      label: "Material",
      children: [],
    };
    if (facts.supplier_batch_id) {
      try {
        const { rows } = await safeSelect(`
          SELECT supplier_batch_id, supplier_name,
                 to_char(received_ts, 'YYYY-MM-DD') AS received,
                 qty_total
            FROM supplier_batch
           WHERE supplier_batch_id = '${safeLit(facts.supplier_batch_id)}' LIMIT 1
        `);
        const b = rows[0] as
          | {
              supplier_batch_id: string;
              supplier_name: string;
              received?: string;
              qty_total?: number;
            }
          | undefined;
        if (b) {
          material.children!.push({
            id: `batch_${b.supplier_batch_id}`,
            kind: "concept",
            label: `Supplier batch ${b.supplier_batch_id}`,
            detail: `${b.supplier_name}${b.received ? ` · received ${b.received}` : ""}${b.qty_total ? ` · ${b.qty_total} units` : ""}`,
            confidence: "high",
            children: [
              {
                id: `batch_${b.supplier_batch_id}_supplier`,
                kind: "evidence",
                label: b.supplier_name,
                detail: "upstream supplier",
                confidence: "high",
              },
            ],
          });
        }
      } catch {
        /* non-fatal */
      }
    }
    if (facts.reported_part_number) {
      material.children!.push({
        id: `part_${facts.reported_part_number}`,
        kind: "concept",
        label: `Part ${facts.reported_part_number}`,
        detail: facts.reported_part_title,
        confidence: "high",
      });
    }
    if ((material.children ?? []).length) root.children!.push(material);
  }

  // -- Machine: occurrence section -------------------------------
  if (facts.occurrence_section_name) {
    root.children!.push({
      id: "cat_Machine",
      kind: "category",
      label: "Machine",
      children: [
        {
          id: "machine_section",
          kind: "concept",
          label: `Produced at ${facts.occurrence_section_name}`,
          detail: "occurrence_section_id",
          confidence: "high",
        },
      ],
    });
  }

  // -- Method: rework action -------------------------------------
  if (facts.rework_text) {
    root.children!.push({
      id: "cat_Method",
      kind: "category",
      label: "Method",
      children: [
        {
          id: "method_rework",
          kind: "concept",
          label: "Rework was required",
          detail: facts.rework_text,
          confidence: "medium",
        },
      ],
    });
  }

  // -- Man: rework operator --------------------------------------
  if (facts.rework_user) {
    root.children!.push({
      id: "cat_Man",
      kind: "category",
      label: "Man",
      children: [
        {
          id: "man_operator",
          kind: "concept",
          label: `Operator ${facts.rework_user}`,
          detail: "performed the rework",
          confidence: "medium",
        },
      ],
    });
  }

  // -- Measurement: linked failing test result --------------------
  if (facts.product_id) {
    try {
      const { rows } = await safeSelect(`
        SELECT tr.test_result_id, tr.test_key, tr.overall_result,
               tr.test_value, tr.unit, t.lower_limit, t.upper_limit, t.title
          FROM test_result tr
          JOIN test t ON t.test_id = tr.test_id
         WHERE tr.product_id = '${safeLit(facts.product_id)}'
           AND tr.overall_result IN ('FAIL','MARGINAL')
         ORDER BY tr.ts DESC LIMIT 3
      `);
      const tests = rows as Array<{
        test_result_id: string;
        test_key: string;
        overall_result: string;
        test_value: number | null;
        unit: string | null;
        lower_limit: number | null;
        upper_limit: number | null;
        title: string | null;
      }>;
      if (tests.length) {
        root.children!.push({
          id: "cat_Measurement",
          kind: "category",
          label: "Measurement",
          children: tests.map((t) => ({
            id: `test_${t.test_result_id}`,
            kind: "concept",
            label: `${t.test_key}: ${t.overall_result}`,
            detail: [
              t.title,
              t.test_value != null
                ? `value ${t.test_value}${t.unit ?? ""}`
                : null,
              t.lower_limit != null || t.upper_limit != null
                ? `limits ${t.lower_limit ?? "?"} / ${t.upper_limit ?? "?"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
            confidence: t.overall_result === "FAIL" ? "high" : "medium",
            children: [
              {
                id: `test_${t.test_result_id}_row`,
                kind: "evidence",
                label: t.test_result_id,
                detail: "test_result row",
                confidence: "high",
              },
            ],
          })),
        });
      }
    } catch {
      /* non-fatal */
    }
  }

  // -- Recurrence history from other defects on the same article --
  if (facts.article_id && (facts.similar_count ?? 0) > 0) {
    root.children!.push({
      id: "cat_Recurrence",
      kind: "category",
      label: "Recurrence",
      children: [
        {
          id: "rec_count",
          kind: "evidence",
          label: `${facts.similar_count} similar ${facts.defect_code ?? "defect"} events in last 12 wk`,
          detail: "same defect_code, different defect_id",
          confidence: "high",
        },
        ...(facts.field_claims_count
          ? [
              {
                id: "rec_claims",
                kind: "evidence" as const,
                label: `${facts.field_claims_count} field claim${facts.field_claims_count === 1 ? "" : "s"} on this product`,
                detail: "customer-facing",
                confidence: "high" as const,
              },
            ]
          : []),
      ],
    });
  }

  // -- Optional: KG "historical pattern" branch -------------------
  try {
    const q =
      `${facts.defect_code ?? ""} ${facts.article_name ?? ""} ${problemText}`.trim();
    if (q) {
      const kgHits = (await hybridSearch(q, 8)).filter(
        (h) => h.kind === "Concept",
      );
      const strong = kgHits.filter((h) => (h.score ?? 0) >= 0.55).slice(0, 4);
      if (strong.length) {
        const patternNode: FaultNode = {
          id: "cat_Pattern",
          kind: "category",
          label: "Historical pattern",
          children: strong.map((h) => ({
            id: h.id,
            kind: "concept",
            label: h.label,
            confidence: confidenceFor(h.score ?? 0),
          })),
        };
        // Attach observations as evidence under each matching concept.
        try {
          const obs = await observationsAbout(
            strong.map((h) => h.id),
            12,
          );
          for (const c of patternNode.children ?? []) {
            c.children = obs
              .filter((o) =>
                o.text.toLowerCase().includes(c.label.toLowerCase().slice(0, 10)),
              )
              .slice(0, 2)
              .map((o) => ({
                id: o.id,
                kind: "evidence" as const,
                label: o.text.slice(0, 120),
                detail: `Observation · first seen ${o.first_seen?.slice(0, 10) ?? "?"}`,
                confidence: "medium" as const,
              }));
          }
        } catch {
          /* non-fatal */
        }
        root.children!.push(patternNode);
      }
    }
  } catch {
    /* non-fatal */
  }

  // If nothing attached, leave a single explanatory leaf so the UI
  // doesn't render an orphan defect node.
  if ((root.children ?? []).length === 0) {
    root.children!.push({
      id: "empty",
      kind: "evidence",
      label: "Not enough linked rows to build a fault tree.",
      detail: "Anchor the 8D on a concrete defect_id to populate this view.",
      confidence: "low",
    });
  }

  return root;
}

/* -------------------------------------------------------------- *
 *  BOM traceability — assembly → components. Highlight the suspect.
 * -------------------------------------------------------------- */

async function buildBomTree(
  articleId: string | undefined,
  suspectPartNumber: string | null | undefined,
): Promise<BomTreeNode | null> {
  if (!articleId) return null;
  let rows: Array<{
    bom_node_id: string;
    parent_bom_node_id: string | null;
    part_number: string;
    find_number: string;
    node_type: string;
  }> = [];
  try {
    const r = await safeSelect(`
      SELECT bn.bom_node_id,
             bn.parent_bom_node_id,
             bn.part_number,
             bn.find_number,
             bn.node_type
        FROM bom b
        JOIN bom_node bn ON bn.bom_id = b.bom_id
       WHERE b.article_id = '${safeLit(articleId)}'
       ORDER BY bn.parent_bom_node_id NULLS FIRST, bn.find_number
       LIMIT 200
    `);
    rows = r.rows as typeof rows;
  } catch {
    return null;
  }
  if (!rows.length) return null;

  // Count defects per part_number across the whole product line (blunt but
  // useful signal — "this part has a history").
  const defectCounts = new Map<string, number>();
  try {
    const r = await safeSelect(`
      SELECT reported_part_number AS pn, COUNT(*)::int AS n
        FROM defect
       WHERE reported_part_number IS NOT NULL
       GROUP BY reported_part_number
    `);
    for (const row of r.rows as Array<{ pn: string; n: number }>) {
      defectCounts.set(row.pn, row.n);
    }
  } catch {
    /* non-fatal */
  }

  // Supplier info per part_number via the view.
  const supplierByPN = new Map<string, { batch?: string; name?: string }>();
  try {
    const r = await safeSelect(`
      SELECT DISTINCT part_number, supplier_batch_id, supplier_name
        FROM v_product_bom_parts
       WHERE part_number IS NOT NULL
    `);
    for (const row of r.rows as Array<{
      part_number: string;
      supplier_batch_id?: string;
      supplier_name?: string;
    }>) {
      if (!supplierByPN.has(row.part_number)) {
        supplierByPN.set(row.part_number, {
          batch: row.supplier_batch_id,
          name: row.supplier_name,
        });
      }
    }
  } catch {
    /* non-fatal */
  }

  const byId = new Map<string, BomTreeNode>();
  const childrenOf = new Map<string | null, BomTreeNode[]>();

  for (const r of rows) {
    const sup = supplierByPN.get(r.part_number);
    const dc = defectCounts.get(r.part_number) ?? 0;
    const suspect =
      suspectPartNumber &&
      (r.part_number === suspectPartNumber || r.find_number === suspectPartNumber);
    const node: BomTreeNode = {
      id: r.bom_node_id,
      label: `${r.find_number} · ${r.part_number}`,
      part_number: r.part_number,
      find_number: r.find_number,
      supplier_batch_id: sup?.batch,
      supplier_name: sup?.name,
      defects_count: dc,
      highlight: suspect ? "root_cause" : dc >= 3 ? "watch" : null,
      children: [],
    };
    byId.set(r.bom_node_id, node);
    const parent = r.parent_bom_node_id ?? null;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(node);
  }
  for (const [pid, ch] of childrenOf.entries()) {
    if (pid && byId.has(pid)) byId.get(pid)!.children = ch;
  }
  const roots = childrenOf.get(null) ?? [];
  if (roots.length === 0) return null;
  // If article has multiple top-level assemblies, wrap them under a synthetic root.
  if (roots.length === 1) return roots[0]!;
  return {
    id: `art_${articleId}`,
    label: `Article ${articleId}`,
    children: roots,
  };
}

/* -------------------------------------------------------------- *
 *  Prevention summary — canned steps plus similar-incidents list.
 * -------------------------------------------------------------- */

async function buildPrevention(
  facts: ReportFacts,
): Promise<IncidentReport["prevention"]> {
  let similarIncidents: SimilarIncident[] = [];
  try {
    const r = await safeSelect(`
      SELECT defect_id, ts::text AS ts, defect_code, severity
        FROM defect
       WHERE defect_code = '${safeLit(facts.defect_code ?? "")}'
         AND defect_id <> '${safeLit(facts.defect_id ?? "")}'
       ORDER BY ts DESC LIMIT 6
    `);
    similarIncidents = r.rows as SimilarIncident[];
  } catch {
    /* non-fatal */
  }

  let openInitiatives: OpenInitiative[] = [];
  try {
    const r = await safeSelect(`
      SELECT action_id, action_type, status, COALESCE(comments,'') AS comments
        FROM product_action
       WHERE product_id = '${safeLit(facts.product_id ?? "")}'
          OR defect_id  = '${safeLit(facts.defect_id ?? "")}'
       ORDER BY ts DESC LIMIT 6
    `);
    openInitiatives = r.rows as OpenInitiative[];
  } catch {
    /* non-fatal */
  }

  const steps: PreventionStep[] = [];
  if (facts.supplier_batch_id) {
    steps.push({
      title: "Quarantine supplier batch",
      detail: `Block further intake from ${facts.supplier_name ?? "supplier"} batch \`${facts.supplier_batch_id}\` until an incoming-inspection result clears it.`,
      owner: "Incoming QC",
    });
    steps.push({
      title: "Open supplier CAPA",
      detail: `Formal corrective-action request against ${facts.supplier_name ?? "supplier"} citing defect \`${facts.defect_id ?? "—"}\`. Require root cause + 8D within 10 working days.`,
      owner: "Supplier quality",
    });
  }
  if (facts.occurrence_section_name) {
    steps.push({
      title: `Audit ${facts.occurrence_section_name}`,
      detail: `On-line audit of SOP + setup parameters for the occurrence section. Verify calibration record of any automated equipment.`,
      owner: "Process engineering",
    });
  }
  if (facts.defect_code) {
    steps.push({
      title: `Add ${facts.defect_code} check to incoming + in-process inspection`,
      detail: `Add a visual / functional gate for \`${facts.defect_code}\` at the earliest section where it can be detected. Update control plan and FMEA.`,
      owner: "Quality engineering",
    });
  }
  steps.push({
    title: "Cross-reference similar articles",
    detail: `Scan the BOM for components sharing the suspect part — apply containment to every article that uses it.`,
    owner: "Quality engineering",
  });
  steps.push({
    title: "Schedule effectiveness review",
    detail: `4-week follow-up: defect rate for \`${facts.defect_code ?? "this code"}\` should drop below the 12-week baseline by ≥ 50 %.`,
    owner: "Quality manager",
  });

  const summary = [
    facts.defect_code
      ? `This incident is the latest of ${1 + (similarIncidents.length ?? 0)} \`${facts.defect_code}\` events in the recent 12 weeks.`
      : `No prior history of this defect code in recent data.`,
    facts.supplier_batch_id
      ? `The evidence points at supplier batch \`${facts.supplier_batch_id}\` of ${facts.reported_part_title ?? facts.reported_part_number ?? "the reported part"} — quarantine it first.`
      : undefined,
    facts.field_claims_count
      ? `${facts.field_claims_count} field claim${facts.field_claims_count > 1 ? "s" : ""} on the same product — treat as customer-facing.`
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return { summary, steps, similarIncidents, openInitiatives };
}

/* -------------------------------------------------------------- *
 *  Risk score — deterministic, with a rationale list the UI can display.
 * -------------------------------------------------------------- */

const SEVERITY_WEIGHT: Record<string, number> = {
  low: 15,
  medium: 35,
  high: 60,
  critical: 85,
};

function bandFor(v: number): RiskBand {
  if (v >= 75) return "critical";
  if (v >= 55) return "high";
  if (v >= 30) return "medium";
  return "low";
}

function computeRisk(facts: ReportFacts): RiskScore {
  const sev = (facts.severity ?? "").toLowerCase();
  const base = SEVERITY_WEIGHT[sev] ?? 20;
  const freqMult = 1 + Math.log10(1 + (facts.similar_count ?? 0)) * 0.6;
  const claimMult = (facts.field_claims_count ?? 0) > 0 ? 1.5 : 1;
  const batchMult = facts.supplier_batch_id ? 1.15 : 1;
  const raw = base * freqMult * claimMult * batchMult;
  const value = Math.max(0, Math.min(100, Math.round(raw)));
  const rationale: string[] = [];
  rationale.push(`Severity ${sev || "unknown"} → base ${base}`);
  if ((facts.similar_count ?? 0) > 0) {
    rationale.push(
      `${facts.similar_count} similar defects in last 12 wk → ×${freqMult.toFixed(2)}`,
    );
  }
  if (claimMult > 1) {
    rationale.push(`Customer field claim on record → ×${claimMult.toFixed(2)}`);
  }
  if (batchMult > 1) {
    rationale.push(
      `Traced to supplier batch ${facts.supplier_batch_id} → ×${batchMult.toFixed(2)}`,
    );
  }
  return { value, band: bandFor(value), rationale };
}

/* -------------------------------------------------------------- *
 *  Cost score — defect cost + rework costs + field-claim costs on product.
 * -------------------------------------------------------------- */

async function computeCost(facts: ReportFacts): Promise<CostScore> {
  const defectCostEur = Number(facts.cost_eur ?? 0) || 0;
  let reworkCostEur = 0;
  let claimCostEur = 0;
  const rationale: string[] = [];

  if (facts.defect_id) {
    try {
      const { rows } = await safeSelect(`
        SELECT COALESCE(SUM(cost), 0)::float AS c
          FROM rework WHERE defect_id = '${safeLit(facts.defect_id)}'
      `);
      reworkCostEur = Number((rows[0] as { c?: number })?.c ?? 0);
    } catch {
      /* non-fatal */
    }
  }
  if (facts.product_id) {
    try {
      const { rows } = await safeSelect(`
        SELECT COALESCE(SUM(cost), 0)::float AS c
          FROM field_claim WHERE product_id = '${safeLit(facts.product_id)}'
      `);
      claimCostEur = Number((rows[0] as { c?: number })?.c ?? 0);
    } catch {
      /* non-fatal */
    }
  }
  const totalEur = Math.round((defectCostEur + reworkCostEur + claimCostEur) * 100) / 100;
  if (defectCostEur) rationale.push(`Defect cost € ${defectCostEur.toFixed(2)}`);
  if (reworkCostEur) rationale.push(`Rework labour € ${reworkCostEur.toFixed(2)}`);
  if (claimCostEur) rationale.push(`Field claims € ${claimCostEur.toFixed(2)}`);
  if (!rationale.length) rationale.push("No direct cost recorded.");
  return { defectCostEur, reworkCostEur, claimCostEur, totalEur, rationale };
}

/* -------------------------------------------------------------- *
 *  Resolution stats — how similar past defects were closed.
 * -------------------------------------------------------------- */

async function computeResolution(
  facts: ReportFacts,
): Promise<ResolutionStats> {
  if (!facts.defect_code) {
    return {
      sampleSize: 0,
      meanDaysToClose: null,
      medianDaysToClose: null,
      actionTypes: [],
      topActions: [],
    };
  }
  let closures: Array<{ days: number }> = [];
  let actionTypes: Array<{ type: string; count: number }> = [];
  let topActions: Array<{ text: string; count: number }> = [];

  try {
    const { rows } = await safeSelect(`
      SELECT d.defect_id,
             d.ts AS defect_ts,
             MIN(pa.ts) AS action_ts,
             pa.action_type,
             pa.comments
        FROM defect d
        JOIN product_action pa ON pa.defect_id = d.defect_id
       WHERE d.defect_code = '${safeLit(facts.defect_code)}'
         AND pa.status = 'done'
       GROUP BY d.defect_id, d.ts, pa.action_type, pa.comments
       ORDER BY d.ts DESC LIMIT 200
    `);
    const typed = rows as Array<{
      defect_id: string;
      defect_ts: string;
      action_ts: string;
      action_type: string;
      comments: string | null;
    }>;
    const byType = new Map<string, number>();
    const byAction = new Map<string, number>();
    for (const r of typed) {
      const d0 = new Date(r.defect_ts).getTime();
      const d1 = new Date(r.action_ts).getTime();
      if (Number.isFinite(d0) && Number.isFinite(d1) && d1 >= d0) {
        closures.push({ days: (d1 - d0) / 86_400_000 });
      }
      byType.set(r.action_type, (byType.get(r.action_type) ?? 0) + 1);
      const firstLine = (r.comments ?? "")
        .split(/\r?\n/)[0]
        ?.trim()
        .slice(0, 80);
      if (firstLine) byAction.set(firstLine, (byAction.get(firstLine) ?? 0) + 1);
    }
    actionTypes = [...byType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    topActions = [...byAction.entries()]
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  } catch {
    /* non-fatal */
  }

  const days = closures.map((c) => c.days).sort((a, b) => a - b);
  const meanDaysToClose =
    days.length > 0
      ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
      : null;
  const medianDaysToClose =
    days.length > 0
      ? Math.round(days[Math.floor(days.length / 2)]! * 10) / 10
      : null;

  return {
    sampleSize: days.length,
    meanDaysToClose,
    medianDaysToClose,
    actionTypes,
    topActions,
  };
}

/* -------------------------------------------------------------- *
 *  Cost impact timeline — weekly € by kind for this article.
 * -------------------------------------------------------------- */

async function computeCostTimeline(
  articleId: string | undefined,
): Promise<CostTimelineBucket[]> {
  if (!articleId) return [];
  const buckets = new Map<string, { defectEur: number; claimEur: number }>();
  const addTo = (weekStart: string, field: "defectEur" | "claimEur", eur: number) => {
    const cur = buckets.get(weekStart) ?? { defectEur: 0, claimEur: 0 };
    cur[field] += eur;
    buckets.set(weekStart, cur);
  };

  try {
    const { rows } = await safeSelect(`
      SELECT to_char(date_trunc('week', d.ts), 'YYYY-MM-DD') AS wk,
             COALESCE(SUM(d.cost), 0)::float AS eur
        FROM defect d
        JOIN product p ON p.product_id = d.product_id
       WHERE p.article_id = '${safeLit(articleId)}'
         AND d.ts >= NOW() - INTERVAL '26 weeks'
       GROUP BY 1 ORDER BY 1
    `);
    for (const r of rows as Array<{ wk: string; eur: number }>) {
      addTo(r.wk, "defectEur", Number(r.eur ?? 0));
    }
  } catch {
    /* non-fatal */
  }
  try {
    const { rows } = await safeSelect(`
      SELECT to_char(date_trunc('week', fc.claim_ts), 'YYYY-MM-DD') AS wk,
             COALESCE(SUM(fc.cost), 0)::float AS eur
        FROM field_claim fc
        JOIN product p ON p.product_id = fc.product_id
       WHERE p.article_id = '${safeLit(articleId)}'
         AND fc.claim_ts >= NOW() - INTERVAL '26 weeks'
       GROUP BY 1 ORDER BY 1
    `);
    for (const r of rows as Array<{ wk: string; eur: number }>) {
      addTo(r.wk, "claimEur", Number(r.eur ?? 0));
    }
  } catch {
    /* non-fatal */
  }

  return [...buckets.entries()]
    .map(([weekStart, v]) => ({
      weekStart,
      defectEur: Math.round(v.defectEur * 100) / 100,
      claimEur: Math.round(v.claimEur * 100) / 100,
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

/* -------------------------------------------------------------- *
 *  Event timeline — build → defect → rework → claim → action.
 * -------------------------------------------------------------- */

async function computeEventsTimeline(
  facts: ReportFacts,
): Promise<TimelineEvent[]> {
  if (!facts.product_id) return [];
  const events: TimelineEvent[] = [];
  try {
    const { rows } = await safeSelect(`
      SELECT build_ts::text AS ts FROM product
       WHERE product_id = '${safeLit(facts.product_id)}'
    `);
    const r = rows[0] as { ts?: string } | undefined;
    if (r?.ts) {
      events.push({
        ts: r.ts,
        kind: "build",
        id: facts.product_id,
        label: `Built ${facts.product_id}`,
      });
    }
  } catch {
    /* non-fatal */
  }
  try {
    const { rows } = await safeSelect(`
      SELECT defect_id, ts::text AS ts, defect_code, severity
        FROM defect
       WHERE product_id = '${safeLit(facts.product_id)}'
       ORDER BY ts LIMIT 50
    `);
    for (const r of rows as Array<{
      defect_id: string;
      ts: string;
      defect_code: string;
      severity: string;
    }>) {
      events.push({
        ts: r.ts,
        kind: "defect",
        id: r.defect_id,
        label: `${r.defect_code} · ${r.defect_id}`,
        severity: r.severity,
      });
    }
  } catch {
    /* non-fatal */
  }
  try {
    const { rows } = await safeSelect(`
      SELECT rework_id, ts::text AS ts,
             COALESCE(SUBSTRING(action_text FROM 1 FOR 60), '(rework)') AS label
        FROM rework WHERE product_id = '${safeLit(facts.product_id)}'
       ORDER BY ts LIMIT 50
    `);
    for (const r of rows as Array<{
      rework_id: string;
      ts: string;
      label: string;
    }>) {
      events.push({
        ts: r.ts,
        kind: "rework",
        id: r.rework_id,
        label: r.label,
      });
    }
  } catch {
    /* non-fatal */
  }
  try {
    const { rows } = await safeSelect(`
      SELECT field_claim_id, claim_ts::text AS ts,
             COALESCE(SUBSTRING(complaint_text FROM 1 FOR 60),
                      '(field claim)') AS label
        FROM field_claim
       WHERE product_id = '${safeLit(facts.product_id)}'
       ORDER BY claim_ts LIMIT 50
    `);
    for (const r of rows as Array<{
      field_claim_id: string;
      ts: string;
      label: string;
    }>) {
      events.push({
        ts: r.ts,
        kind: "claim",
        id: r.field_claim_id,
        label: r.label,
      });
    }
  } catch {
    /* non-fatal */
  }
  try {
    const { rows } = await safeSelect(`
      SELECT action_id, ts::text AS ts, action_type, status,
             COALESCE(SUBSTRING(comments FROM 1 FOR 60), action_type) AS label
        FROM product_action
       WHERE product_id = '${safeLit(facts.product_id)}'
          OR defect_id  = '${safeLit(facts.defect_id ?? "")}'
       ORDER BY ts LIMIT 50
    `);
    for (const r of rows as Array<{
      action_id: string;
      ts: string;
      action_type: string;
      status: string;
      label: string;
    }>) {
      events.push({
        ts: r.ts,
        kind: "action",
        id: r.action_id,
        label: `${r.action_type}: ${r.label}`,
      });
    }
  } catch {
    /* non-fatal */
  }

  events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return events;
}

/* -------------------------------------------------------------- *
 *  Entry point.
 * -------------------------------------------------------------- */

function safeLit(s: string): string {
  return (s ?? "").replace(/'/g, "''").replace(/[;\\]/g, "");
}

export async function generateReportFromDraft(
  draftId: string,
): Promise<IncidentReport> {
  const draft = await loadDraft(draftId);
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  const defectId = guessDefectId(draft);
  const articleId =
    draft.doc?.customer?.articleNr ||
    draft.doc?.supplier?.articleNr ||
    undefined;

  const { facts, defect } = await factsFor(defectId, articleId);
  const problemText = draft.doc?.problem ?? "";
  const [
    faultTree,
    bomTree,
    prevention,
    cost,
    resolution,
    costTimeline,
    timeline,
  ] = await Promise.all([
    buildFaultTree(facts, problemText),
    buildBomTree(
      facts.article_id ?? articleId,
      facts.reported_part_number ?? defect?.reported_part_number ?? null,
    ),
    buildPrevention(facts),
    computeCost(facts),
    computeResolution(facts),
    computeCostTimeline(facts.article_id ?? articleId),
    computeEventsTimeline(facts),
  ]);
  const risk = computeRisk(facts);

  const report: IncidentReport = {
    id: newReportId(),
    name: draft.name ? `${draft.name} — incident analysis` : "Incident analysis",
    generatedAt: new Date().toISOString(),
    source: {
      draftId: draft.id,
      draftName: draft.name,
      defect_id: defectId,
    },
    facts,
    risk,
    cost,
    faultTree,
    bomTree,
    timeline,
    costTimeline,
    resolution,
    prevention,
  };
  return report;
}
