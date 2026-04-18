/**
 * Server-side KG queries used by the /wiki UI. Keep these separate from the
 * agent-facing query.ts so it's easier to tune each surface independently.
 */
import { kg } from "./client";

export type EntitySummary = {
  id: string;
  kind: string;
  label: string;
  body: string;
  manex_table: string;
  manex_id: string;
  updated_at: string;
};

export type ConceptSummary = {
  id: string;
  title: string;
  body: string;
  updated_at: string;
};

export type ObservationSummary = {
  id: string;
  text: string;
  confidence: number;
  first_seen: string;
};

export type ReportSummary = {
  id: string;
  report_kind: string;
  title: string;
  status: string;
  created_at: string;
};

export type SourceSummary = {
  id: string;
  source_kind: string;
  title: string;
  url: string;
  body: string;
  ingested_at: string;
};

export type LogRow = {
  id: string;
  ts: string;
  action: string;
  summary: string;
};

export async function stats() {
  const c = kg();
  const [ents, cons, obs, reps, srcs, logs] = await Promise.all([
    c.run(`MATCH (n:Entity) RETURN COUNT(n) AS n`),
    c.run(`MATCH (n:Concept) RETURN COUNT(n) AS n`),
    c.run(`MATCH (n:Observation) RETURN COUNT(n) AS n`),
    c.run(`MATCH (n:Report) RETURN COUNT(n) AS n`),
    c.run(`MATCH (n:Source) RETURN COUNT(n) AS n`),
    c.run(`MATCH (n:LogEntry) RETURN COUNT(n) AS n`),
  ]);
  const toInt = (rows: Record<string, unknown>[]) =>
    Number(rows[0]?.n ?? 0) || 0;
  return {
    entities: toInt(ents),
    concepts: toInt(cons),
    observations: toInt(obs),
    reports: toInt(reps),
    sources: toInt(srcs),
    logs: toInt(logs),
  };
}

export async function listEntities(): Promise<EntitySummary[]> {
  const rows = await kg().run(
    `MATCH (n:Entity)
     RETURN n.id AS id, n.kind AS kind, n.label AS label,
            n.body AS body, n.manex_table AS manex_table,
            n.manex_id AS manex_id, n.updated_at AS updated_at
     ORDER BY n.kind, n.label`,
  );
  return rows as unknown as EntitySummary[];
}

export async function listConcepts(): Promise<ConceptSummary[]> {
  const rows = await kg().run(
    `MATCH (n:Concept)
     RETURN n.id AS id, n.title AS title, n.body AS body,
            n.updated_at AS updated_at
     ORDER BY n.title`,
  );
  return rows as unknown as ConceptSummary[];
}

export async function listRecentObservations(
  limit = 25,
): Promise<ObservationSummary[]> {
  const cap = Math.max(1, Math.min(limit, 200));
  const rows = await kg().run(
    `MATCH (n:Observation)
     RETURN n.id AS id, n.text AS text,
            n.confidence AS confidence, n.first_seen AS first_seen
     ORDER BY n.first_seen DESC
     LIMIT ${cap}`,
  );
  return rows as unknown as ObservationSummary[];
}

export async function listReports(): Promise<ReportSummary[]> {
  const rows = await kg().run(
    `MATCH (n:Report)
     RETURN n.id AS id, n.report_kind AS report_kind,
            n.title AS title, n.status AS status,
            n.created_at AS created_at
     ORDER BY n.created_at DESC`,
  );
  return rows as unknown as ReportSummary[];
}

export async function listSources(): Promise<SourceSummary[]> {
  const rows = await kg().run(
    `MATCH (n:Source)
     RETURN n.id AS id, n.source_kind AS source_kind,
            n.title AS title, n.url AS url, n.body AS body,
            n.ingested_at AS ingested_at
     ORDER BY n.ingested_at DESC`,
  );
  return rows as unknown as SourceSummary[];
}

export async function listLog(limit = 50): Promise<LogRow[]> {
  const cap = Math.max(1, Math.min(limit, 500));
  const rows = await kg().run(
    `MATCH (n:LogEntry)
     RETURN n.id AS id, n.ts AS ts,
            n.action AS action, n.summary AS summary
     ORDER BY n.ts DESC
     LIMIT ${cap}`,
  );
  return rows as unknown as LogRow[];
}

/* ------- Node detail ------- */

export type NodeDetail = {
  kind: string;
  id: string;
  label: string;
  body?: string;
  subkind?: string;
  manex_table?: string;
  manex_id?: string;
  status?: string;
  report_kind?: string;
  url?: string;
  confidence?: number;
  first_seen?: string;
};

export type NeighborEdge = {
  id: string;
  label: string;
  kind: string;
  rel: string;
  direction: "out" | "in";
};

export type NodeDetailBundle = {
  node: NodeDetail | null;
  neighbors: NeighborEdge[];
  observations: ObservationSummary[];
  reports: ReportSummary[];
  contained_observations?: ObservationSummary[]; // reports only
};

const LABEL_PROP: Record<string, string> = {
  Entity: "label",
  Concept: "title",
  Observation: "text",
  Report: "title",
  Source: "title",
};

async function findLabel(id: string): Promise<string | null> {
  const labels = ["Entity", "Concept", "Observation", "Report", "Source"];
  for (const l of labels) {
    const r = await kg().run(
      `MATCH (x:${l}) WHERE x.id = $anchor RETURN x.id AS found LIMIT 1`,
      { anchor: id },
    );
    if (r.length) return l;
  }
  return null;
}

async function fetchNode(id: string, label: string): Promise<NodeDetail | null> {
  const c = kg();
  switch (label) {
    case "Entity": {
      const [n] = await c.run(
        `MATCH (x:Entity) WHERE x.id = $anchor
         RETURN x.id AS xid, x.kind AS subkind, x.label AS lbl,
                x.body AS body, x.manex_table AS manex_table,
                x.manex_id AS manex_id`,
        { anchor: id },
      );
      if (!n) return null;
      return {
        kind: "Entity",
        id: String(n.xid),
        subkind: n.subkind as string,
        label: String(n.lbl),
        body: (n.body as string) || undefined,
        manex_table: (n.manex_table as string) || undefined,
        manex_id: (n.manex_id as string) || undefined,
      };
    }
    case "Concept": {
      const [n] = await c.run(
        `MATCH (x:Concept) WHERE x.id = $anchor
         RETURN x.id AS xid, x.title AS lbl, x.body AS body`,
        { anchor: id },
      );
      if (!n) return null;
      return {
        kind: "Concept",
        id: String(n.xid),
        label: String(n.lbl),
        body: (n.body as string) || undefined,
      };
    }
    case "Observation": {
      const [n] = await c.run(
        `MATCH (x:Observation) WHERE x.id = $anchor
         RETURN x.id AS xid, x.text AS lbl,
                x.confidence AS confidence,
                x.first_seen AS first_seen`,
        { anchor: id },
      );
      if (!n) return null;
      return {
        kind: "Observation",
        id: String(n.xid),
        label: String(n.lbl),
        confidence: Number(n.confidence),
        first_seen: String(n.first_seen),
      };
    }
    case "Report": {
      const [n] = await c.run(
        `MATCH (x:Report) WHERE x.id = $anchor
         RETURN x.id AS xid, x.title AS lbl, x.body AS body,
                x.status AS status, x.report_kind AS report_kind`,
        { anchor: id },
      );
      if (!n) return null;
      return {
        kind: "Report",
        id: String(n.xid),
        label: String(n.lbl),
        body: (n.body as string) || undefined,
        status: n.status as string,
        report_kind: n.report_kind as string,
      };
    }
    case "Source": {
      const [n] = await c.run(
        `MATCH (x:Source) WHERE x.id = $anchor
         RETURN x.id AS xid, x.title AS lbl, x.body AS body,
                x.url AS url, x.source_kind AS source_kind`,
        { anchor: id },
      );
      if (!n) return null;
      return {
        kind: "Source",
        id: String(n.xid),
        label: String(n.lbl),
        body: (n.body as string) || undefined,
        url: n.url as string,
        subkind: n.source_kind as string,
      };
    }
  }
  return null;
}

// Enumerate all (start,end,rel) combinations that actually exist.
const REL_CATALOG: Array<{
  start: string;
  rel: string;
  end: string;
}> = [
  { start: "Observation", rel: "ABOUT_ENTITY", end: "Entity" },
  { start: "Observation", rel: "ABOUT_CONCEPT", end: "Concept" },
  { start: "Report", rel: "REPORT_ABOUT_ENTITY", end: "Entity" },
  { start: "Report", rel: "REPORT_ABOUT_CONCEPT", end: "Concept" },
  { start: "Observation", rel: "EVIDENCED_BY", end: "Source" },
  { start: "Observation", rel: "CITES_MANEX", end: "Entity" },
  { start: "Report", rel: "CONTAINS", end: "Observation" },
  { start: "Entity", rel: "STRUCTURAL", end: "Entity" },
  { start: "Concept", rel: "CAUSED_BY", end: "Concept" },
  { start: "Concept", rel: "SUBTYPE_OF", end: "Concept" },
  { start: "Concept", rel: "INDICATED_BY", end: "Entity" },
];

async function neighborsWithRel(
  id: string,
  startLabel: string,
): Promise<NeighborEdge[]> {
  const out: NeighborEdge[] = [];
  const c = kg();
  const debug = process.env.KG_DEBUG === "1";
  for (const r of REL_CATALOG) {
    if (r.start === startLabel) {
      const labelExpr = `m.${LABEL_PROP[r.end] ?? "id"}`;
      const cypher = `MATCH (a:${r.start})-[rl:${r.rel}]->(m:${r.end})
           WHERE a.id = $anchor
           RETURN m.id AS out_id, ${labelExpr} AS out_label${
             r.rel === "STRUCTURAL" ? ", rl.rel AS rel_sub" : ""
           }`;
      try {
        const rows = await c.run(cypher, { anchor: id });
        for (const row of rows) {
          out.push({
            id: String(row.out_id),
            label: String(row.out_label ?? ""),
            kind: r.end,
            rel:
              r.rel === "STRUCTURAL"
                ? String(row.rel_sub ?? "STRUCTURAL")
                : r.rel,
            direction: "out",
          });
        }
      } catch (e) {
        if (debug) console.error("[nbr out]", r.rel, (e as Error).message);
      }
    }
    if (r.end === startLabel) {
      const labelExpr = `m.${LABEL_PROP[r.start] ?? "id"}`;
      const cypher = `MATCH (m:${r.start})-[rl:${r.rel}]->(a:${r.end})
           WHERE a.id = $anchor
           RETURN m.id AS out_id, ${labelExpr} AS out_label${
             r.rel === "STRUCTURAL" ? ", rl.rel AS rel_sub" : ""
           }`;
      try {
        const rows = await c.run(cypher, { anchor: id });
        for (const row of rows) {
          out.push({
            id: String(row.out_id),
            label: String(row.out_label ?? ""),
            kind: r.start,
            rel:
              r.rel === "STRUCTURAL"
                ? String(row.rel_sub ?? "STRUCTURAL")
                : r.rel,
            direction: "in",
          });
        }
      } catch (e) {
        if (debug) console.error("[nbr in]", r.rel, (e as Error).message);
      }
    }
  }
  return out;
}

export async function nodeDetail(id: string): Promise<NodeDetailBundle> {
  const label = await findLabel(id);
  if (!label) {
    return { node: null, neighbors: [], observations: [], reports: [] };
  }
  const node = await fetchNode(id, label);
  const neighbors = await neighborsWithRel(id, label);
  const observations: ObservationSummary[] = neighbors
    .filter((n) => n.kind === "Observation" && n.direction === "in")
    .map((n) => ({
      id: n.id,
      text: n.label,
      confidence: 0,
      first_seen: "",
    }));
  const reports: ReportSummary[] = neighbors
    .filter((n) => n.kind === "Report" && n.direction === "in")
    .map((n) => ({
      id: n.id,
      report_kind: "",
      title: n.label,
      status: "",
      created_at: "",
    }));
  let contained: ObservationSummary[] | undefined;
  if (label === "Report") {
    contained = neighbors
      .filter((n) => n.kind === "Observation" && n.direction === "out")
      .map((n) => ({
        id: n.id,
        text: n.label,
        confidence: 0,
        first_seen: "",
      }));
  }
  return {
    node,
    neighbors,
    observations,
    reports,
    contained_observations: contained,
  };
}

/* ------- Graph export (for React Flow view) ------- */

export type GraphNode = {
  id: string;
  label: string;
  kind: string;      // node-table label
  subkind?: string;  // entity.kind or concept title, etc.
};
export type GraphEdge = {
  from: string;
  to: string;
  rel: string;
};

export async function graphAll(): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}> {
  const c = kg();
  const nodeRows = [
    ...((await c.run(
      `MATCH (n:Entity) RETURN n.id AS id, n.label AS label, n.kind AS subkind, 'Entity' AS kind`,
    )) as GraphNode[]),
    ...((await c.run(
      `MATCH (n:Concept) RETURN n.id AS id, n.title AS label, 'Concept' AS kind`,
    )) as GraphNode[]),
    ...((await c.run(
      `MATCH (n:Observation) RETURN n.id AS id, n.text AS label, 'Observation' AS kind`,
    )) as GraphNode[]),
    ...((await c.run(
      `MATCH (n:Report) RETURN n.id AS id, n.title AS label, n.report_kind AS subkind, 'Report' AS kind`,
    )) as GraphNode[]),
    ...((await c.run(
      `MATCH (n:Source) RETURN n.id AS id, n.title AS label, n.source_kind AS subkind, 'Source' AS kind`,
    )) as GraphNode[]),
  ];
  const edges: GraphEdge[] = [];
  for (const r of REL_CATALOG) {
    try {
      const rows = (await c.run(
        `MATCH (a:${r.start})-[rl:${r.rel}]->(b:${r.end})
         RETURN a.id AS from_id, b.id AS to_id
                ${r.rel === "STRUCTURAL" ? ", rl.rel AS rel_sub" : ""}`,
      )) as Array<{ from_id: string; to_id: string; rel_sub?: string }>;
      for (const row of rows) {
        edges.push({
          from: String(row.from_id),
          to: String(row.to_id),
          rel:
            r.rel === "STRUCTURAL"
              ? String(row.rel_sub ?? "STRUCTURAL")
              : r.rel,
        });
      }
    } catch {
      /* skip empty rel */
    }
  }
  return { nodes: nodeRows, edges };
}
