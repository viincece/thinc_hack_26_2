/**
 * Shared types for the knowledge graph layer.
 *
 * The graph itself lives in Kuzu (WASM, in-process).  Persistence is a JSONL
 * event log on disk at <WIKI_DATA_DIR>/events.jsonl — every write appends an
 * event; on startup we replay the log into a fresh Kuzu database.  This keeps
 * the store diffable and git-friendly, per the llm-wiki pattern.
 */

export type EntityKind =
  | "Part"
  | "Supplier"
  | "Batch"
  | "Article"
  | "Factory"
  | "Line"
  | "Section"
  | "Operator"
  | "BomPosition"
  | "DefectCode"
  | "TestCode"
  | "Product"
  | "Order"
  | "DefectInstance"
  | "FieldClaim";

export type ReportKind = "8D" | "FMEA" | "Investigation";

export type SourceKind =
  | "sop"
  | "datasheet"
  | "old-8d"
  | "interview"
  | "email"
  | "manex-row"
  | "image"
  | "note";

export type StructuralRel =
  | "SUPPLIED_BY"
  | "OF_PART"
  | "USED_AT"
  | "IN_ARTICLE"
  | "INSTALLED_IN"
  | "OCCURRED_AT"
  | "REWORKED_BY"
  | "BELONGS_TO"
  | "ON_PRODUCT"
  | "MAPPED_TO"
  // Defect-anchored empirical links mined from historical /defect rows.
  // "DefectCode is detected by this test", "…typically originates at
  // this section", "…commonly affects this part."
  | "DETECTED_BY"
  | "OCCURS_AT"
  | "AFFECTS_PART"
  // Static metadata from the /test table — "this test exercises this
  // part".
  | "TESTS_PART";

export type Vector = number[];

export type EventUpsertEntity = {
  kind: "entity";
  id: string;
  entity_kind: EntityKind;
  label: string;
  body?: string;
  manex_table?: string;
  manex_id?: string;
};

export type EventUpsertConcept = {
  kind: "concept";
  id: string;            // slug, e.g. "cold-solder-joint"
  title: string;
  body?: string;
};

export type EventUpsertSource = {
  kind: "source";
  id: string;
  source_kind: SourceKind;
  title: string;
  url?: string;
  body?: string;
};

export type EventUpsertObservation = {
  kind: "observation";
  id: string;
  text: string;
  confidence: number;
  first_seen: string;     // ISO
  last_confirmed?: string;
  about_entities?: string[];
  about_concepts?: string[];
  evidenced_by?: string;  // source id
  cites_manex?: Array<{ table: string; row_id: string; entity_id?: string }>;
};

export type EventUpsertReport = {
  kind: "report";
  id: string;
  report_kind: ReportKind;
  title: string;
  body: string;
  status: "draft" | "final" | "superseded";
  author: string;
  created_at: string;
  closed_at?: string;
  contains_observations?: string[];
  about_entities?: string[];
  about_concepts?: string[];
};

export type EventLink = {
  kind: "link";
  rel: StructuralRel | "CAUSED_BY" | "INDICATED_BY" | "SUBTYPE_OF";
  from: string;
  to: string;
};

export type EventLog = {
  kind: "log";
  id: string;
  ts: string;
  action: string;
  summary: string;
};

export type KgEvent =
  | EventUpsertEntity
  | EventUpsertConcept
  | EventUpsertSource
  | EventUpsertObservation
  | EventUpsertReport
  | EventLink
  | EventLog;
