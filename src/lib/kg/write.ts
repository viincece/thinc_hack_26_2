import { kg } from "./client";
import { embed } from "./embed";
import type {
  EntityKind,
  EventUpsertEntity,
  EventUpsertConcept,
  EventUpsertSource,
  EventUpsertObservation,
  EventUpsertReport,
  EventLink,
  EventLog,
  SourceKind,
  StructuralRel,
  ReportKind,
} from "./types";

/**
 * Thin write-facing API. Every function appends to the JSONL log AND mutates
 * Kuzu, and where appropriate keeps the in-memory embedding map in sync.
 */

function nowIso() {
  return new Date().toISOString();
}

export async function upsertEntity(e: {
  id: string;
  entity_kind: EntityKind;
  label: string;
  body?: string;
  manex_table?: string;
  manex_id?: string;
}) {
  const ev: EventUpsertEntity = { kind: "entity", ...e };
  await kg().append(ev);
  if (e.body) {
    const v = await embed(`${e.entity_kind}: ${e.label}\n${e.body}`);
    kg().setEmbedding(e.id, v);
  }
}

export async function upsertConcept(c: {
  id: string;
  title: string;
  body?: string;
}) {
  const ev: EventUpsertConcept = { kind: "concept", ...c };
  await kg().append(ev);
  const v = await embed(`${c.title}\n${c.body ?? ""}`);
  kg().setEmbedding(c.id, v);
}

export async function upsertSource(s: {
  id: string;
  source_kind: SourceKind;
  title: string;
  url?: string;
  body?: string;
}) {
  const ev: EventUpsertSource = { kind: "source", ...s };
  await kg().append(ev);
  if (s.body) {
    const v = await embed(`${s.title}\n${s.body.slice(0, 4000)}`);
    kg().setEmbedding(s.id, v);
  }
}

export async function writeObservation(o: {
  id: string;
  text: string;
  confidence?: number;
  first_seen?: string;
  last_confirmed?: string;
  about_entities?: string[];
  about_concepts?: string[];
  evidenced_by?: string;
  cites_manex?: Array<{ table: string; row_id: string; entity_id?: string }>;
}) {
  const ev: EventUpsertObservation = {
    kind: "observation",
    id: o.id,
    text: o.text,
    confidence: o.confidence ?? 0.8,
    first_seen: o.first_seen ?? nowIso(),
    last_confirmed: o.last_confirmed,
    about_entities: o.about_entities,
    about_concepts: o.about_concepts,
    evidenced_by: o.evidenced_by,
    cites_manex: o.cites_manex,
  };
  await kg().append(ev);
  const v = await embed(o.text);
  kg().setEmbedding(o.id, v);
}

export async function writeReport(r: {
  id: string;
  report_kind: ReportKind;
  title: string;
  body: string;
  status?: "draft" | "final" | "superseded";
  author?: string;
  closed_at?: string;
  contains_observations?: string[];
  about_entities?: string[];
  about_concepts?: string[];
}) {
  const ev: EventUpsertReport = {
    kind: "report",
    id: r.id,
    report_kind: r.report_kind,
    title: r.title,
    body: r.body,
    status: r.status ?? "draft",
    author: r.author ?? "team",
    created_at: nowIso(),
    closed_at: r.closed_at,
    contains_observations: r.contains_observations,
    about_entities: r.about_entities,
    about_concepts: r.about_concepts,
  };
  await kg().append(ev);
  const v = await embed(`${r.title}\n${r.body.slice(0, 4000)}`);
  kg().setEmbedding(r.id, v);
}

export async function link(
  rel: StructuralRel | "CAUSED_BY" | "INDICATED_BY" | "SUBTYPE_OF",
  from: string,
  to: string,
) {
  const ev: EventLink = { kind: "link", rel, from, to };
  await kg().append(ev);
}

export async function logEntry(action: string, summary: string) {
  const ev: EventLog = {
    kind: "log",
    id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    ts: nowIso(),
    action,
    summary,
  };
  await kg().append(ev);
}
