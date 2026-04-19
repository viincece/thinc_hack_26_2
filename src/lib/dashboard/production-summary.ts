import { safeSelect } from "@/lib/db";

/**
 * Production + quality metrics over the last 6 months, per article and
 * per supplier. Feeds the "Production & quality health" panel at the
 * bottom of the dashboard.
 *
 * The answers this panel gives:
 *   - How many units of each article have we built?
 *   - Of those, what fraction had at least one in-factory defect?
 *   - What fraction reached the customer and came back as a claim?
 *   - What did each article's issues cost us?
 *   - Which supplier batches are dragging us down?
 *
 * Everything is derived from `product`, `defect`, `field_claim` and
 * `v_product_bom_parts` — no Kuzu, no embeddings, no LLM. Pure SQL so
 * the panel stays snappy and works on Vercel serverless.
 */

export type ArticleHealth = {
  article_id: string;
  article_name: string;
  unitsBuilt: number;
  /** Units with at least one in-factory defect. */
  unitsWithDefect: number;
  /** Units with at least one field claim. */
  unitsWithClaim: number;
  /** Total in-factory defect count (not units). Signals defect density. */
  defectCount: number;
  /** Field-claim count. */
  claimCount: number;
  /** In-factory defect cost in €. */
  defectCostEur: number;
  /** Field-claim cost in €. */
  claimCostEur: number;
  /** Aggregate cost used for ranking: defect + claim. */
  totalCostEur: number;
};

export type SupplierHealth = {
  supplier_name: string;
  /** Number of distinct `supplier_batch` rows observed in 6 mo. */
  batches: number;
  /** Number of distinct products that used any part from this supplier. */
  productsAffected: number;
  /** Defects on products that used this supplier's parts. */
  defectCount: number;
  /** Defect rate per 1 000 products the supplier is installed on. */
  defectPerThousand: number;
  defectCostEur: number;
};

export type ProductionSummary = {
  totalUnitsBuilt: number;
  totalDefectCount: number;
  totalClaimCount: number;
  totalCostEur: number;
  /** Aggregate first-pass / margin / fail across all test_result rows. */
  testMix: { pass: number; marginal: number; fail: number };
  articles: ArticleHealth[];
  suppliers: SupplierHealth[];
};

/** Convenience: percentage with sensible empty-data handling. */
export function pct(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

/* -------------------------------------------------------------- *
 *  Article health
 * -------------------------------------------------------------- */

async function articleHealth(): Promise<ArticleHealth[]> {
  try {
    const { rows } = await safeSelect(`
      WITH produced AS (
        SELECT article_id, COUNT(*)::int AS units
          FROM product
         WHERE build_ts >= NOW() - INTERVAL '6 months'
         GROUP BY article_id
      ),
      defected AS (
        SELECT p.article_id,
               COUNT(DISTINCT d.product_id)::int AS units_with_defect,
               COUNT(*)::int                     AS defect_count,
               COALESCE(SUM(d.cost), 0)::float   AS defect_cost
          FROM defect d
          JOIN product p ON p.product_id = d.product_id
         WHERE p.build_ts >= NOW() - INTERVAL '6 months'
         GROUP BY p.article_id
      ),
      claimed AS (
        SELECT p.article_id,
               COUNT(DISTINCT fc.product_id)::int AS units_with_claim,
               COUNT(*)::int                      AS claim_count,
               COALESCE(SUM(fc.cost), 0)::float   AS claim_cost
          FROM field_claim fc
          JOIN product p ON p.product_id = fc.product_id
         WHERE p.build_ts >= NOW() - INTERVAL '6 months'
         GROUP BY p.article_id
      )
      SELECT a.article_id,
             COALESCE(a.name, a.article_id) AS article_name,
             COALESCE(pr.units, 0)              AS units,
             COALESCE(de.units_with_defect, 0)  AS units_with_defect,
             COALESCE(de.defect_count, 0)       AS defect_count,
             COALESCE(de.defect_cost, 0)        AS defect_cost,
             COALESCE(cl.units_with_claim, 0)   AS units_with_claim,
             COALESCE(cl.claim_count, 0)        AS claim_count,
             COALESCE(cl.claim_cost, 0)         AS claim_cost
        FROM article a
        LEFT JOIN produced pr ON pr.article_id = a.article_id
        LEFT JOIN defected de ON de.article_id = a.article_id
        LEFT JOIN claimed  cl ON cl.article_id = a.article_id
       ORDER BY COALESCE(pr.units, 0) DESC,
                a.article_id
    `);
    return (
      rows as Array<{
        article_id: string;
        article_name: string;
        units: number;
        units_with_defect: number;
        defect_count: number;
        defect_cost: number;
        units_with_claim: number;
        claim_count: number;
        claim_cost: number;
      }>
    ).map((r) => ({
      article_id: r.article_id,
      article_name: r.article_name,
      unitsBuilt: Number(r.units ?? 0),
      unitsWithDefect: Number(r.units_with_defect ?? 0),
      unitsWithClaim: Number(r.units_with_claim ?? 0),
      defectCount: Number(r.defect_count ?? 0),
      claimCount: Number(r.claim_count ?? 0),
      defectCostEur: Number(r.defect_cost ?? 0),
      claimCostEur: Number(r.claim_cost ?? 0),
      totalCostEur: Number(r.defect_cost ?? 0) + Number(r.claim_cost ?? 0),
    }));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------- *
 *  Supplier health — ranked by defect incidents tied to their parts
 * -------------------------------------------------------------- */

async function supplierHealth(): Promise<SupplierHealth[]> {
  try {
    const { rows } = await safeSelect(`
      WITH supplier_products AS (
        SELECT v.supplier_name,
               COUNT(DISTINCT v.supplier_batch_id)::int AS batches,
               COUNT(DISTINCT v.product_id)::int        AS products_touched
          FROM v_product_bom_parts v
         WHERE v.supplier_name IS NOT NULL
         GROUP BY v.supplier_name
      ),
      supplier_defects AS (
        SELECT v.supplier_name,
               COUNT(DISTINCT d.defect_id)::int AS defect_count,
               COALESCE(SUM(d.cost), 0)::float  AS defect_cost
          FROM v_product_bom_parts v
          JOIN defect d ON d.product_id = v.product_id
         WHERE d.ts >= NOW() - INTERVAL '6 months'
           AND v.supplier_name IS NOT NULL
         GROUP BY v.supplier_name
      )
      SELECT sp.supplier_name,
             sp.batches,
             sp.products_touched,
             COALESCE(sd.defect_count, 0) AS defect_count,
             COALESCE(sd.defect_cost, 0)  AS defect_cost
        FROM supplier_products sp
        LEFT JOIN supplier_defects sd
          ON sd.supplier_name = sp.supplier_name
       ORDER BY COALESCE(sd.defect_count, 0) DESC,
                sp.products_touched DESC
    `);
    return (
      rows as Array<{
        supplier_name: string;
        batches: number;
        products_touched: number;
        defect_count: number;
        defect_cost: number;
      }>
    ).map((r) => {
      const products = Number(r.products_touched ?? 0);
      const defects = Number(r.defect_count ?? 0);
      return {
        supplier_name: r.supplier_name,
        batches: Number(r.batches ?? 0),
        productsAffected: products,
        defectCount: defects,
        defectPerThousand:
          products > 0 ? Math.round((defects / products) * 1000) : 0,
        defectCostEur: Number(r.defect_cost ?? 0),
      };
    });
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------- *
 *  Test mix — the shop-floor's first-pass / marginal / fail split
 * -------------------------------------------------------------- */

async function testMix(): Promise<{ pass: number; marginal: number; fail: number }> {
  try {
    const { rows } = await safeSelect(`
      SELECT overall_result, COUNT(*)::int AS n
        FROM test_result
       WHERE ts >= NOW() - INTERVAL '6 months'
       GROUP BY overall_result
    `);
    const out = { pass: 0, marginal: 0, fail: 0 };
    for (const r of rows as Array<{ overall_result: string; n: number }>) {
      const n = Number(r.n ?? 0);
      if (r.overall_result === "PASS") out.pass = n;
      else if (r.overall_result === "MARGINAL") out.marginal = n;
      else if (r.overall_result === "FAIL") out.fail = n;
    }
    return out;
  } catch {
    return { pass: 0, marginal: 0, fail: 0 };
  }
}

/* -------------------------------------------------------------- *
 *  Entry point
 * -------------------------------------------------------------- */

export async function getProductionSummary(): Promise<ProductionSummary> {
  const [articles, suppliers, mix] = await Promise.all([
    articleHealth(),
    supplierHealth(),
    testMix(),
  ]);
  const totalUnitsBuilt = articles.reduce((n, a) => n + a.unitsBuilt, 0);
  const totalDefectCount = articles.reduce((n, a) => n + a.defectCount, 0);
  const totalClaimCount = articles.reduce((n, a) => n + a.claimCount, 0);
  const totalCostEur = articles.reduce((n, a) => n + a.totalCostEur, 0);
  return {
    totalUnitsBuilt,
    totalDefectCount,
    totalClaimCount,
    totalCostEur,
    testMix: mix,
    articles,
    suppliers,
  };
}
