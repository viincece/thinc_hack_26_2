/**
 * Idempotently imports structural entities from the Manex REST API into the
 * knowledge graph, and emits a handful of analytic Observations the co-pilot
 * can reuse when drafting reports.
 *
 * Call patterns: Article → BOM positions → Part.  Supplier → Batch → Part.
 * Factory → Line → Section.  DefectCode, TestCode stand alone.
 */
import { manex } from "@/lib/manex";
import {
  upsertEntity,
  upsertConcept,
  link,
  writeObservation,
  logEntry,
} from "./write";

/* ------- Row shapes (subset) ------- */

type ArticleRow = { article_id: string; name: string };
type SectionRow = {
  section_id: string;
  line_id: string | null;
  name: string;
  section_type: string | null;
  sequence_no: number | null;
};
type LineRow = {
  line_id: string;
  factory_id: string | null;
  name: string;
  line_type: string | null;
  area: string | null;
};
type FactoryRow = {
  factory_id: string;
  name: string;
  country: string | null;
  site_code: string | null;
};
type BomRow = { bom_id: string; article_id: string; status: string | null };
type BomNodeRow = {
  bom_node_id: string;
  bom_id: string;
  parent_bom_node_id: string | null;
  part_number: string | null;
  qty: number | null;
  node_type: string | null;
  find_number: string;
};
type PartMasterRow = {
  part_number: string;
  title: string;
  commodity: string | null;
  drawing_number: string | null;
  revision: string | null;
  uom: string | null;
  notes: string | null;
};
type SupplierBatchRow = {
  batch_id: string;
  part_number: string;
  batch_number: string | null;
  supplier_name: string | null;
  supplier_id: string | null;
  received_date: string | null;
  qty: number | null;
};
type TestRow = {
  test_id: string;
  section_id: string | null;
  part_number: string | null;
  title: string;
  test_location: string | null;
  test_type: string | null;
  lower_limit: number | null;
  upper_limit: number | null;
};
type DefectRow = { defect_code: string; severity: string | null };

/* ------- Fetch helpers ------- */

async function fetchAll<T>(path: string, select: string): Promise<T[]> {
  // Dataset is <10k rows total; one page is fine.
  return manex<T[]>(path, { select, limit: 5000 });
}

/* ------- Ingest routines ------- */

async function ingestFactories() {
  const rows = await fetchAll<FactoryRow>(
    "/factory",
    "factory_id,name,country,site_code",
  );
  for (const r of rows) {
    await upsertEntity({
      id: r.factory_id,
      entity_kind: "Factory",
      label: `${r.name} (${r.site_code ?? r.factory_id})`,
      manex_table: "factory",
      manex_id: r.factory_id,
      body: `Factory in ${r.country ?? "—"}.`,
    });
  }
  return rows.length;
}

async function ingestLines() {
  const rows = await fetchAll<LineRow>(
    "/line",
    "line_id,factory_id,name,line_type,area",
  );
  for (const r of rows) {
    await upsertEntity({
      id: r.line_id,
      entity_kind: "Line",
      label: `${r.name}${r.area ? ` (${r.area})` : ""}`,
      manex_table: "line",
      manex_id: r.line_id,
      body: r.line_type ? `${r.line_type} line.` : undefined,
    });
    if (r.factory_id) await link("BELONGS_TO", r.line_id, r.factory_id);
  }
  return rows.length;
}

async function ingestSections() {
  const rows = await fetchAll<SectionRow>(
    "/section",
    "section_id,line_id,name,section_type,sequence_no",
  );
  for (const r of rows) {
    await upsertEntity({
      id: r.section_id,
      entity_kind: "Section",
      label: r.name,
      manex_table: "section",
      manex_id: r.section_id,
      body: r.section_type
        ? `${r.section_type} station${r.sequence_no ? ` (seq ${r.sequence_no})` : ""}.`
        : undefined,
    });
    if (r.line_id) await link("BELONGS_TO", r.section_id, r.line_id);
  }
  return rows.length;
}

async function ingestArticles() {
  const rows = await fetchAll<ArticleRow>("/article", "article_id,name");
  for (const r of rows) {
    await upsertEntity({
      id: r.article_id,
      entity_kind: "Article",
      label: `${r.name} (${r.article_id})`,
      manex_table: "article",
      manex_id: r.article_id,
      body: `Product article. ${r.name}.`,
    });
  }
  return rows;
}

async function ingestPartMasters() {
  const rows = await fetchAll<PartMasterRow>(
    "/part_master",
    "part_number,title,commodity,drawing_number,revision,uom,notes",
  );
  for (const r of rows) {
    await upsertEntity({
      id: r.part_number,
      entity_kind: "Part",
      label: `${r.part_number} — ${r.title}`,
      manex_table: "part_master",
      manex_id: r.part_number,
      body:
        [r.title, r.commodity ? `commodity: ${r.commodity}` : null, r.notes]
          .filter(Boolean)
          .join("\n") || undefined,
    });
  }
  return rows.length;
}

async function ingestSuppliers(batches: SupplierBatchRow[]) {
  const byId = new Map<string, { id: string; name: string }>();
  for (const b of batches) {
    if (!b.supplier_id) continue;
    const id = `supplier:${b.supplier_id}`;
    if (byId.has(id)) continue;
    byId.set(id, { id, name: b.supplier_name ?? b.supplier_id });
  }
  for (const s of byId.values()) {
    await upsertEntity({
      id: s.id,
      entity_kind: "Supplier",
      label: s.name,
      manex_table: "supplier_batch",
      manex_id: s.id,
      body: `Supplier referenced in supplier_batch.`,
    });
  }
  return byId.size;
}

async function ingestBatches() {
  const batches = await fetchAll<SupplierBatchRow>(
    "/supplier_batch",
    "batch_id,part_number,batch_number,supplier_name,supplier_id,received_date,qty",
  );
  await ingestSuppliers(batches);
  for (const b of batches) {
    await upsertEntity({
      id: b.batch_id,
      entity_kind: "Batch",
      label: `${b.batch_id} (${b.part_number})`,
      manex_table: "supplier_batch",
      manex_id: b.batch_id,
      body:
        [
          b.batch_number ? `Batch number: ${b.batch_number}` : null,
          b.supplier_name ? `Supplier: ${b.supplier_name}` : null,
          b.received_date ? `Received: ${b.received_date}` : null,
          b.qty ? `Qty: ${b.qty}` : null,
        ]
          .filter(Boolean)
          .join("\n") || undefined,
    });
    if (b.supplier_id) await link("SUPPLIED_BY", b.batch_id, `supplier:${b.supplier_id}`);
    if (b.part_number) await link("OF_PART", b.batch_id, b.part_number);
  }
  return batches.length;
}

async function ingestBom(articles: ArticleRow[]) {
  const boms = await fetchAll<BomRow>("/bom", "bom_id,article_id,status");
  const bomByArticle = new Map<string, string[]>();
  for (const b of boms) {
    if (b.status && b.status !== "active") continue;
    if (!bomByArticle.has(b.article_id)) bomByArticle.set(b.article_id, []);
    bomByArticle.get(b.article_id)!.push(b.bom_id);
  }

  const nodes = await fetchAll<BomNodeRow>(
    "/bom_node",
    "bom_node_id,bom_id,parent_bom_node_id,part_number,qty,node_type,find_number",
  );

  const nodesByBom = new Map<string, BomNodeRow[]>();
  for (const n of nodes) {
    if (!nodesByBom.has(n.bom_id)) nodesByBom.set(n.bom_id, []);
    nodesByBom.get(n.bom_id)!.push(n);
  }

  let positions = 0;
  const bomSizeByArticle = new Map<string, number>();
  for (const a of articles) {
    const bomIds = bomByArticle.get(a.article_id) ?? [];
    const seenFindNumbers = new Set<string>();
    for (const bid of bomIds) {
      const bnodes = nodesByBom.get(bid) ?? [];
      for (const bn of bnodes) {
        if (!bn.find_number) continue;
        if (bn.node_type === "assembly") continue; // focus on components
        const key = `${a.article_id}:${bn.find_number}`;
        if (seenFindNumbers.has(key)) continue;
        seenFindNumbers.add(key);
        const id = `bompos:${a.article_id}:${bn.find_number}`;
        await upsertEntity({
          id,
          entity_kind: "BomPosition",
          label: `${bn.find_number} on ${a.name}`,
          manex_table: "bom_node",
          manex_id: bn.bom_node_id,
          body: `BOM position ${bn.find_number} on article ${a.article_id}. ${
            bn.part_number ? `Populated by ${bn.part_number}.` : ""
          }${bn.qty ? ` Qty ${bn.qty}.` : ""}`,
        });
        await link("IN_ARTICLE", id, a.article_id);
        if (bn.part_number) await link("USED_AT", bn.part_number, id);
        positions += 1;
      }
    }
    bomSizeByArticle.set(a.article_id, seenFindNumbers.size);
  }
  return { positions, bomSizeByArticle };
}

async function ingestDefectCodes() {
  // PostgREST has no DISTINCT; page through a limited selection.
  const rows = await manex<DefectRow[]>("/defect", {
    select: "defect_code,severity",
    limit: 5000,
  });
  const counts = new Map<
    string,
    { count: number; sev: Record<string, number> }
  >();
  for (const r of rows) {
    const b = counts.get(r.defect_code) ?? { count: 0, sev: {} };
    b.count += 1;
    if (r.severity) b.sev[r.severity] = (b.sev[r.severity] ?? 0) + 1;
    counts.set(r.defect_code, b);
  }
  const total = rows.length;
  const sorted = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [code, info] of sorted) {
    const id = `defectcode:${code}`;
    const severityLine = Object.entries(info.sev)
      .map(([k, v]) => `${k}×${v}`)
      .join(", ");
    await upsertEntity({
      id,
      entity_kind: "DefectCode",
      label: code,
      manex_table: "defect",
      manex_id: code,
      body:
        `In-factory defect code.\n\n` +
        `Observed ${info.count}× across all defects (${
          total ? ((info.count / total) * 100).toFixed(1) : 0
        }% of total).${severityLine ? `\n\nSeverity mix: ${severityLine}.` : ""}`,
    });
  }
  return { total, distinctCodes: counts.size, sorted };
}

async function ingestTestCodes() {
  const rows = await fetchAll<TestRow>(
    "/test",
    "test_id,section_id,part_number,title,test_location,test_type,lower_limit,upper_limit",
  );
  const seen = new Set<string>();
  for (const t of rows) {
    // Use the test_location as the identifier — it is shared across repeated
    // test definitions for the same measurement (e.g. "VIB_TEST").
    const code = t.test_location?.trim();
    if (!code) continue;
    const id = `testcode:${code}`;
    if (seen.has(id)) continue;
    seen.add(id);
    await upsertEntity({
      id,
      entity_kind: "TestCode",
      label: code,
      manex_table: "test",
      manex_id: t.test_id,
      body:
        `${t.title ?? code}${
          t.test_type ? `\n\nType: ${t.test_type}.` : ""
        }${t.lower_limit != null || t.upper_limit != null
          ? `\n\nLimits: [${t.lower_limit ?? "—"}, ${t.upper_limit ?? "—"}].`
          : ""}`,
    });
    if (t.section_id) await link("BELONGS_TO", id, t.section_id);
  }
  return seen.size;
}

/* ------- Abstract observations + concepts ------- */

async function emitAnalytics(
  articles: ArticleRow[],
  bomSizeByArticle: Map<string, number>,
  defectInfo: {
    total: number;
    distinctCodes: number;
    sorted: Array<[string, { count: number; sev: Record<string, number> }]>;
  },
) {
  // Detection-bias concept — every quality co-pilot should know this.
  await upsertConcept({
    id: "detection-bias",
    title: "Detection bias (end-of-line gate effect)",
    body:
      "A station that sits at the end of the line will *detect* the majority of defects " +
      "regardless of where they originate. High defect counts at a gate section are not " +
      "a root-cause signal. Always check `occurrence_section_id`, not `detected_section_id`, " +
      "when reasoning about cause.",
  });

  await upsertConcept({
    id: "pareto-heuristic",
    title: "Pareto — 80/20 for defect codes",
    body:
      "A small number of defect codes usually account for the majority of events. " +
      "Focus root-cause effort on the top bars first; the tail is long but cheap to ignore " +
      "until the head is fixed.",
  });

  await upsertConcept({
    id: "near-miss-leading-indicator",
    title: "Near-miss test results as leading indicator",
    body:
      "Test results whose value lands close to (but inside) the spec limit are not " +
      "failures, but they are the leading edge of a drift. Surfacing them early makes " +
      "preventive actions possible before a true FAIL materializes.",
  });

  // Pareto observation.
  if (defectInfo.sorted.length) {
    const topN = defectInfo.sorted.slice(0, 3);
    const share =
      topN.reduce((s, [, v]) => s + v.count, 0) / Math.max(1, defectInfo.total);
    await writeObservation({
      id: "OBS-STATS-PARETO",
      text:
        `Across ${defectInfo.total} in-factory defects, the top three codes ` +
        `(${topN.map(([c]) => c).join(", ")}) account for ` +
        `${(share * 100).toFixed(0)}% of events. ` +
        `Investigation effort should prioritize these first.`,
      confidence: 1,
      about_entities: topN.map(([c]) => `defectcode:${c}`),
      about_concepts: ["pareto-heuristic"],
      evidenced_by: "SRC-DATA-PATTERNS",
    });
  }

  // Per-article BOM complexity observation for the largest BOMs.
  const largest = [...bomSizeByArticle.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [aid, size] of largest) {
    const art = articles.find((a) => a.article_id === aid);
    if (!size || !art) continue;
    await writeObservation({
      id: `OBS-BOM-${aid}`,
      text:
        `${art.name} (${aid}) has ${size} populated BOM positions. ` +
        `When drafting an FMEA, iterate each position — the dominant failure modes ` +
        `typically cluster at a small subset of them.`,
      confidence: 1,
      about_entities: [aid],
      evidenced_by: "SRC-DATA-PATTERNS",
    });
  }

  // Detection-bias observation for end-of-line Pruefung sections.
  await writeObservation({
    id: "OBS-DETECTION-BIAS-PRUEFUNG",
    text:
      "End-of-line 'Pruefung' sections gate virtually every product leaving the line. " +
      "They therefore detect the majority of defects regardless of origin. When a " +
      "Pruefung section appears as the top occurrence in a count, treat that as " +
      "detection bias rather than a causal signal.",
    confidence: 1,
    about_concepts: ["detection-bias"],
    evidenced_by: "SRC-DATA-PATTERNS",
  });
}

/* ------- Orchestrator ------- */

export async function ingestFromManex() {
  // Order matters: structural parents before children, then edges.
  const factories = await ingestFactories();
  const lines = await ingestLines();
  const sections = await ingestSections();
  const articles = await ingestArticles();
  const parts = await ingestPartMasters();
  const batches = await ingestBatches();
  const bom = await ingestBom(articles);
  const defects = await ingestDefectCodes();
  const tests = await ingestTestCodes();

  await emitAnalytics(articles, bom.bomSizeByArticle, defects);

  const summary =
    `Factories:${factories}, Lines:${lines}, Sections:${sections}, ` +
    `Articles:${articles.length}, Parts:${parts}, Batches:${batches}, ` +
    `BomPositions:${bom.positions}, DefectCodes:${defects.distinctCodes}, ` +
    `TestCodes:${tests}.`;

  await logEntry("ingest_sql", `Pulled structural entities from Manex: ${summary}`);

  return summary;
}
