import { kg } from "./client";
import { cosine, embed } from "./embed";

/* -------------------------------------------------------------- *
 *  Read helpers used by the agent tools.
 *
 *  Note: Kuzu's Cypher dialect is a subset of Neo4j's.  It does NOT
 *  support label disjunction (`(n:A OR n:B)`) or rel-type union
 *  (`-[:A|B]->`) the way Neo4j does. Where we need "nodes of any
 *  kind", we run one query per label and merge in JS.
 * -------------------------------------------------------------- */

const NODE_LABELS = [
  "Entity",
  "Concept",
  "Observation",
  "Report",
  "Source",
] as const;

export async function anchor(handle: {
  entity_id?: string;
  manex_id?: string;
  article_id?: string;
  defect_code?: string;
}): Promise<Array<{ id: string; kind: string; label: string }>> {
  const c = kg();
  if (handle.entity_id) {
    return (await c.run(
      `MATCH (e:Entity {id: $id}) RETURN e.id AS id, e.kind AS kind, e.label AS label`,
      { id: handle.entity_id },
    )) as Array<{ id: string; kind: string; label: string }>;
  }
  if (handle.manex_id) {
    return (await c.run(
      `MATCH (e:Entity {manex_id: $id}) RETURN e.id AS id, e.kind AS kind, e.label AS label`,
      { id: handle.manex_id },
    )) as Array<{ id: string; kind: string; label: string }>;
  }
  if (handle.article_id) {
    return (await c.run(
      `MATCH (e:Entity {id: $id}) WHERE e.kind = 'Article'
       RETURN e.id AS id, e.kind AS kind, e.label AS label`,
      { id: handle.article_id },
    )) as Array<{ id: string; kind: string; label: string }>;
  }
  if (handle.defect_code) {
    return (await c.run(
      `MATCH (e:Entity) WHERE e.kind = 'DefectCode' AND e.label = $lbl
       RETURN e.id AS id, e.kind AS kind, e.label AS label`,
      { lbl: handle.defect_code },
    )) as Array<{ id: string; kind: string; label: string }>;
  }
  return [];
}

export async function getNode(id: string) {
  const c = kg();
  const queries: Array<[string, string]> = [
    [
      "Entity",
      `MATCH (n:Entity {id: $id})
       RETURN 'Entity' AS kind, n.id AS id, n.kind AS subkind,
              n.label AS label, n.body AS body,
              n.manex_table AS manex_table, n.manex_id AS manex_id`,
    ],
    [
      "Concept",
      `MATCH (n:Concept {id: $id})
       RETURN 'Concept' AS kind, n.id AS id, n.title AS label, n.body AS body`,
    ],
    [
      "Observation",
      `MATCH (n:Observation {id: $id})
       RETURN 'Observation' AS kind, n.id AS id, n.text AS label,
              n.confidence AS confidence, n.first_seen AS first_seen`,
    ],
    [
      "Report",
      `MATCH (n:Report {id: $id})
       RETURN 'Report' AS kind, n.id AS id, n.title AS label, n.body AS body,
              n.status AS status, n.report_kind AS report_kind`,
    ],
    [
      "Source",
      `MATCH (n:Source {id: $id})
       RETURN 'Source' AS kind, n.id AS id, n.title AS label, n.body AS body,
              n.url AS url`,
    ],
  ];
  for (const [, cypher] of queries) {
    const rows = await c.run(cypher, { id });
    if (rows.length) return rows[0];
  }
  return null;
}

export async function neighborhood(id: string, depth = 2) {
  const c = kg();
  const d = Math.max(1, Math.min(3, Math.floor(depth)));

  // Find the label of the anchor first — var-length patterns need it.
  let startLabel: string | null = null;
  for (const lbl of NODE_LABELS) {
    try {
      const r = (await c.run(
        `MATCH (n:${lbl} {id: $id}) RETURN n.id AS id LIMIT 1`,
        { id },
      )) as Array<{ id: string }>;
      if (r.length) {
        startLabel = lbl;
        break;
      }
    } catch {
      /* skip */
    }
  }
  if (!startLabel) return [];

  const dedup = new Map<
    string,
    { id: string; label: string; kind: string }
  >();
  const labelCol: Record<(typeof NODE_LABELS)[number], string> = {
    Entity: "m.label",
    Concept: "m.title",
    Observation: "m.text",
    Report: "m.title",
    Source: "m.title",
  };

  for (const end of NODE_LABELS) {
    for (const direction of ["OUT", "IN"] as const) {
      const pattern =
        direction === "OUT"
          ? `(a:${startLabel} {id: $id})-[*1..${d}]->(m:${end})`
          : `(a:${startLabel} {id: $id})<-[*1..${d}]-(m:${end})`;
      try {
        const rows = (await c.run(
          `MATCH ${pattern}
           RETURN DISTINCT m.id AS id, ${labelCol[end]} AS label
           LIMIT 100`,
          { id },
        )) as Array<{ id: string; label: string }>;
        for (const r of rows) {
          if (r.id && !dedup.has(r.id)) {
            dedup.set(r.id, { id: r.id, label: r.label, kind: end });
          }
        }
      } catch (e) {
        if (process.env.KG_DEBUG) {
          console.error(`[kg.neighborhood] ${pattern} ->`, (e as Error).message);
        }
      }
    }
  }
  dedup.delete(id);
  return [...dedup.values()];
}

export async function observationsAbout(ids: string[], limit = 40) {
  if (!ids.length) return [];
  const c = kg();
  const ph = ids.map((_, i) => `$id${i}`).join(",");
  const params = Object.fromEntries(ids.map((v, i) => [`id${i}`, v]));
  const cap = Math.max(1, Math.min(limit, 200));
  const collected = new Map<
    string,
    {
      id: string;
      text: string;
      confidence: number;
      first_seen: string;
    }
  >();
  const rels = ["ABOUT_ENTITY", "ABOUT_CONCEPT"] as const;
  for (const rel of rels) {
    try {
      const rows = (await c.run(
        `MATCH (o:Observation)-[:${rel}]->(n)
         WHERE n.id IN [${ph}] AND o.superseded = false
         RETURN DISTINCT o.id AS id, o.text AS text,
                o.confidence AS confidence, o.first_seen AS first_seen
         LIMIT ${cap}`,
        params,
      )) as Array<{
        id: string;
        text: string;
        confidence: number;
        first_seen: string;
      }>;
      for (const r of rows) if (r.id && !collected.has(r.id)) collected.set(r.id, r);
    } catch {
      // rel table may not include the target label — skip
    }
  }
  return [...collected.values()]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, cap);
}

export async function reportsAbout(ids: string[], limit = 10) {
  if (!ids.length) return [];
  const c = kg();
  const ph = ids.map((_, i) => `$id${i}`).join(",");
  const params = Object.fromEntries(ids.map((v, i) => [`id${i}`, v]));
  const cap = Math.max(1, Math.min(limit, 50));
  const collected = new Map<
    string,
    {
      id: string;
      report_kind: string;
      title: string;
      status: string;
      created_at: string;
    }
  >();
  const rels = ["REPORT_ABOUT_ENTITY", "REPORT_ABOUT_CONCEPT"] as const;
  for (const rel of rels) {
    try {
      const rows = (await c.run(
        `MATCH (r:Report)-[:${rel}]->(n)
         WHERE n.id IN [${ph}]
         RETURN DISTINCT r.id AS id, r.report_kind AS report_kind,
                r.title AS title, r.status AS status,
                r.created_at AS created_at
         LIMIT ${cap}`,
        params,
      )) as Array<{
        id: string;
        report_kind: string;
        title: string;
        status: string;
        created_at: string;
      }>;
      for (const r of rows) if (r.id && !collected.has(r.id)) collected.set(r.id, r);
    } catch {
      // skip
    }
  }
  return [...collected.values()].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
}

export async function hybridSearch(query: string, k = 10) {
  const c = kg();
  const vec = await embed(query);
  const needle = query.toLowerCase();

  const hits: Array<{
    id: string;
    label: string;
    kind: string;
    score: number;
  }> = [];

  // FTS via CONTAINS — per label.
  const perLabel: Record<(typeof NODE_LABELS)[number], string> = {
    Entity: `MATCH (n:Entity)
             WHERE toLower(n.label) CONTAINS $q
                OR toLower(n.body)  CONTAINS $q
             RETURN n.id AS id, n.label AS label, 'Entity' AS kind LIMIT 20`,
    Concept: `MATCH (n:Concept)
              WHERE toLower(n.title) CONTAINS $q
                 OR toLower(n.body)  CONTAINS $q
              RETURN n.id AS id, n.title AS label, 'Concept' AS kind LIMIT 20`,
    Observation: `MATCH (n:Observation)
                  WHERE toLower(n.text) CONTAINS $q
                  RETURN n.id AS id, n.text AS label, 'Observation' AS kind LIMIT 20`,
    Report: `MATCH (n:Report)
             WHERE toLower(n.title) CONTAINS $q
                OR toLower(n.body)  CONTAINS $q
             RETURN n.id AS id, n.title AS label, 'Report' AS kind LIMIT 20`,
    Source: `MATCH (n:Source)
             WHERE toLower(n.title) CONTAINS $q
                OR toLower(n.body)  CONTAINS $q
             RETURN n.id AS id, n.title AS label, 'Source' AS kind LIMIT 20`,
  };
  for (const cypher of Object.values(perLabel)) {
    try {
      const rows = (await c.run(cypher, { q: needle })) as Array<{
        id: string;
        label: string;
        kind: string;
      }>;
      for (const r of rows) hits.push({ ...r, score: 0.5 });
    } catch {
      // ignore
    }
  }

  if (vec) {
    for (const { id, vec: v } of kg().allEmbeddings()) {
      const s = cosine(vec, v);
      if (s > 0.3) hits.push({ id, label: "", kind: "?", score: s });
    }
  }

  const merged = new Map<string, (typeof hits)[number]>();
  for (const r of hits) {
    const prev = merged.get(r.id);
    if (!prev || r.score > prev.score) {
      merged.set(r.id, prev ? { ...prev, score: Math.max(prev.score, r.score) } : r);
    }
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(k, 25)));
}

export async function similarReports(text: string, k = 5) {
  const c = kg();
  const vec = await embed(text);
  const reports = (await c.run(
    `MATCH (r:Report) RETURN r.id AS id, r.title AS title,
            r.report_kind AS report_kind, r.status AS status`,
  )) as Array<{ id: string; title: string; report_kind: string; status: string }>;
  if (!reports.length) return [];
  if (!vec) {
    return reports.slice(0, k).map((r) => ({ ...r, score: 0 }));
  }
  const ranked = reports
    .map((r) => ({ ...r, score: cosine(vec, kg().getEmbedding(r.id)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return ranked;
}
