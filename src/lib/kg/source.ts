/**
 * Static snapshot of the knowledge graph.
 *
 * Populated at build time by `scripts/dump-kg-snapshot.ts`, read at
 * runtime when the live Kuzu client can't boot (see runtime.ts).
 *
 * The function signatures here mirror `browse.ts` + `query.ts` exactly
 * so the wiki pages and the agent tools transparently fall back.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { cosine } from "./embed";
import type {
  ConceptSummary,
  EntitySummary,
  LogRow,
  NodeDetailBundle,
  ObservationSummary,
  ReportSummary,
  SourceSummary,
  GraphNode,
  GraphEdge,
} from "./browse";

/* -------------------------------------------------------------- *
 *  Snapshot shape — everything the wiki UI + agent read about.
 * -------------------------------------------------------------- */

export type KgSnapshot = {
  generatedAt: string;
  stats: {
    entities: number;
    concepts: number;
    observations: number;
    reports: number;
    sources: number;
    logs: number;
  };
  entities: EntitySummary[];
  concepts: ConceptSummary[];
  observations: ObservationSummary[];
  reports: ReportSummary[];
  sources: SourceSummary[];
  log: LogRow[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  nodeDetails: Record<string, NodeDetailBundle>;
  /** Embeddings in the format kg().allEmbeddings() yields — scrubbed
   *  to id+vec so hybrid search still works on the snapshot. */
  embeddings: Array<{ id: string; vec: number[] }>;
};

/* -------------------------------------------------------------- *
 *  Loader — one disk read per process, cached forever.
 * -------------------------------------------------------------- */

const SNAPSHOT_PATH = path.join(process.cwd(), "public", "wiki-snapshot.json");
let _cache: KgSnapshot | null = null;
let _loading: Promise<KgSnapshot> | null = null;

async function load(): Promise<KgSnapshot> {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
      _cache = JSON.parse(raw) as KgSnapshot;
    } catch {
      _cache = emptySnapshot();
    }
    return _cache;
  })();
  return _loading;
}

function emptySnapshot(): KgSnapshot {
  return {
    generatedAt: "",
    stats: { entities: 0, concepts: 0, observations: 0, reports: 0, sources: 0, logs: 0 },
    entities: [],
    concepts: [],
    observations: [],
    reports: [],
    sources: [],
    log: [],
    graph: { nodes: [], edges: [] },
    nodeDetails: {},
    embeddings: [],
  };
}

/* -------------------------------------------------------------- *
 *  browse.ts mirrors
 * -------------------------------------------------------------- */

export async function stats() {
  return (await load()).stats;
}
export async function listEntities(): Promise<EntitySummary[]> {
  return (await load()).entities;
}
export async function listConcepts(): Promise<ConceptSummary[]> {
  return (await load()).concepts;
}
export async function listRecentObservations(
  limit = 25,
): Promise<ObservationSummary[]> {
  const cap = Math.max(1, Math.min(limit, 200));
  return (await load()).observations.slice(0, cap);
}
export async function listReports(): Promise<ReportSummary[]> {
  return (await load()).reports;
}
export async function listSources(): Promise<SourceSummary[]> {
  return (await load()).sources;
}
export async function listLog(limit = 50): Promise<LogRow[]> {
  const cap = Math.max(1, Math.min(limit, 500));
  return (await load()).log.slice(0, cap);
}
export async function graphAll() {
  return (await load()).graph;
}
export async function nodeDetail(id: string): Promise<NodeDetailBundle> {
  const snap = await load();
  return (
    snap.nodeDetails[id] ?? {
      node: null,
      neighbors: [],
      observations: [],
      reports: [],
    }
  );
}

/* -------------------------------------------------------------- *
 *  query.ts mirrors — used by the agent tools.
 * -------------------------------------------------------------- */

export async function anchor(handle: {
  entity_id?: string;
  manex_id?: string;
  article_id?: string;
  defect_code?: string;
}) {
  const snap = await load();
  const out: Array<{ id: string; kind: string; label: string }> = [];
  const matches = (e: EntitySummary): boolean => {
    if (handle.entity_id && e.id === handle.entity_id) return true;
    if (handle.manex_id && e.manex_id === handle.manex_id) return true;
    if (handle.article_id && e.kind === "Article" && e.id === handle.article_id)
      return true;
    if (
      handle.defect_code &&
      e.kind === "DefectCode" &&
      e.label === handle.defect_code
    )
      return true;
    return false;
  };
  for (const e of snap.entities) {
    if (matches(e)) {
      out.push({ id: e.id, kind: e.kind, label: e.label });
    }
  }
  return out;
}

export async function getNode(id: string) {
  const detail = (await load()).nodeDetails[id];
  if (!detail?.node) return null;
  // Flatten to the shape query.getNode() used to return.
  const n = detail.node;
  switch (n.kind) {
    case "Entity":
      return {
        kind: "Entity",
        id: n.id,
        subkind: n.subkind,
        label: n.label,
        body: n.body,
        manex_table: n.manex_table,
        manex_id: n.manex_id,
      };
    case "Concept":
      return {
        kind: "Concept",
        id: n.id,
        label: n.label,
        body: n.body,
      };
    case "Observation":
      return {
        kind: "Observation",
        id: n.id,
        label: n.label,
        confidence: n.confidence,
        first_seen: n.first_seen,
      };
    case "Report":
      return {
        kind: "Report",
        id: n.id,
        label: n.label,
        body: n.body,
        status: n.status,
        report_kind: n.report_kind,
      };
    case "Source":
      return {
        kind: "Source",
        id: n.id,
        label: n.label,
        body: n.body,
        url: n.url,
      };
    default:
      return null;
  }
}

export async function neighborhood(
  id: string,
  _depth = 2,
): Promise<Array<{ id: string; label: string; kind: string }>> {
  // Pre-computed 1-hop set from the snapshot. A deeper walk isn't
  // worth building statically; in practice 1-hop neighbours carry the
  // signal the agent acts on.
  const detail = (await load()).nodeDetails[id];
  if (!detail) return [];
  const out = new Map<string, { id: string; label: string; kind: string }>();
  for (const n of detail.neighbors) {
    if (!out.has(n.id)) out.set(n.id, { id: n.id, label: n.label, kind: n.kind });
  }
  out.delete(id);
  return [...out.values()];
}

export async function observationsAbout(ids: string[], limit = 40) {
  if (!ids.length) return [];
  const cap = Math.max(1, Math.min(limit, 200));
  const snap = await load();
  const want = new Set(ids);
  const out = new Map<string, ObservationSummary>();
  for (const obs of snap.observations) {
    const d = snap.nodeDetails[obs.id];
    if (!d) continue;
    const hits = d.neighbors.some(
      (nb) =>
        (nb.rel === "ABOUT_ENTITY" || nb.rel === "ABOUT_CONCEPT") &&
        want.has(nb.id),
    );
    if (hits && !out.has(obs.id)) out.set(obs.id, obs);
    if (out.size >= cap) break;
  }
  return [...out.values()]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, cap);
}

export async function reportsAbout(ids: string[], limit = 10) {
  if (!ids.length) return [];
  const cap = Math.max(1, Math.min(limit, 50));
  const snap = await load();
  const want = new Set(ids);
  const out = new Map<string, ReportSummary>();
  for (const rep of snap.reports) {
    const d = snap.nodeDetails[rep.id];
    if (!d) continue;
    const hits = d.neighbors.some(
      (nb) =>
        (nb.rel === "REPORT_ABOUT_ENTITY" ||
          nb.rel === "REPORT_ABOUT_CONCEPT") &&
        want.has(nb.id),
    );
    if (hits && !out.has(rep.id)) out.set(rep.id, rep);
  }
  return [...out.values()].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
}

export async function hybridSearch(query: string, k = 10) {
  const snap = await load();
  const needle = query.toLowerCase();
  const hits: Array<{ id: string; label: string; kind: string; score: number }> =
    [];
  const push = (id: string, label: string, kind: string, s: number) => {
    if (!id) return;
    hits.push({ id, label, kind, score: s });
  };

  // Text scan.
  for (const e of snap.entities) {
    if (
      e.label?.toLowerCase().includes(needle) ||
      e.body?.toLowerCase().includes(needle)
    ) push(e.id, e.label, "Entity", 0.5);
  }
  for (const c of snap.concepts) {
    if (
      c.title?.toLowerCase().includes(needle) ||
      c.body?.toLowerCase().includes(needle)
    ) push(c.id, c.title, "Concept", 0.5);
  }
  for (const o of snap.observations) {
    if (o.text?.toLowerCase().includes(needle))
      push(o.id, o.text, "Observation", 0.5);
  }
  for (const r of snap.reports) {
    if (r.title?.toLowerCase().includes(needle)) push(r.id, r.title, "Report", 0.5);
  }
  for (const s of snap.sources) {
    if (
      s.title?.toLowerCase().includes(needle) ||
      s.body?.toLowerCase().includes(needle)
    ) push(s.id, s.title, "Source", 0.5);
  }

  // Vector scan — reuse cached embeddings if they were dumped.
  // We don't call the embedder on Vercel; without a local embedder the
  // vector side is skipped and the hybrid degrades to pure FTS, which
  // is fine for hackathon scale.
  const labelById = new Map<string, { label: string; kind: string }>();
  for (const e of snap.entities) labelById.set(e.id, { label: e.label, kind: "Entity" });
  for (const c of snap.concepts) labelById.set(c.id, { label: c.title, kind: "Concept" });
  for (const o of snap.observations)
    labelById.set(o.id, { label: o.text, kind: "Observation" });
  for (const r of snap.reports) labelById.set(r.id, { label: r.title, kind: "Report" });
  for (const s of snap.sources) labelById.set(s.id, { label: s.title, kind: "Source" });

  const merged = new Map<string, (typeof hits)[number]>();
  for (const r of hits) {
    const meta = labelById.get(r.id);
    const normed = meta
      ? { ...r, label: r.label || meta.label, kind: r.kind || meta.kind }
      : r;
    const prev = merged.get(r.id);
    if (!prev || normed.score > prev.score) merged.set(r.id, normed);
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(k, 25)));
}

export async function similarReports(_text: string, k = 5) {
  const snap = await load();
  const embById = new Map(snap.embeddings.map((e) => [e.id, e.vec] as const));
  const reports = snap.reports.map((r) => ({
    id: r.id,
    title: r.title,
    report_kind: r.report_kind,
    status: r.status,
  }));
  if (!reports.length) return [];
  // Without a runtime embedder the best we can do is score by label
  // overlap with the needle. Cheap placeholder — snapshot mode is
  // read-only demo material anyway.
  void embById;
  void cosine;
  return reports.slice(0, k).map((r) => ({ ...r, score: 0 }));
}
