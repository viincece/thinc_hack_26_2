import type { EightDDoc, FieldMetaMap } from "@/components/copilot/eight-d-doc";
import { store } from "@/lib/storage/object-store";

/**
 * Document kinds we persist. 8D is the only editor we ship today; FMEA and
 * Analysis are reserved now so the schema + file-naming can accept new
 * types the moment those editors land. Re-exported from the client-safe
 * `drafts-kinds` module so browser bundles don't pull in `node:fs`.
 */
export { DRAFT_KINDS, type DraftKind } from "./drafts-kinds";
import type { DraftKind } from "./drafts-kinds";

const KIND_PREFIX: Record<DraftKind, string> = {
  "8D": "8D",
  FMEA: "FMEA",
  Analysis: "ANL",
};

/** Infer kind from the id prefix for legacy files written before `kind` was tracked. */
export function kindFromId(id: string): DraftKind {
  if (id.startsWith("FMEA-")) return "FMEA";
  // Older "Investigation" drafts used the INV- prefix — surface them as Analysis.
  if (id.startsWith("ANL-") || id.startsWith("INV-")) return "Analysis";
  return "8D";
}

export type DraftRecord = {
  id: string;
  name: string;
  date: string;
  kind: DraftKind;
  filename: string;
  updatedAt: string;
  problemPreview: string;
  articleName?: string;
  sizeBytes: number;
};

export type DraftFile = {
  id: string;
  name: string;
  date: string;
  kind: DraftKind;
  doc: EightDDoc;
  meta: FieldMetaMap;
  savedAt: string;
};

/**
 * Key prefix inside the object store.  Resolves under `public/drafts/`
 * on local FS and `drafts/` inside the Vercel Blob store.
 */
export const DRAFTS_PREFIX = "drafts";

/** <PREFIX>-YYMMDD-XXXX — short, collision-avoidant, prefix encodes kind */
export function newDraftId(kind: DraftKind = "8D"): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ymd = `${d.getFullYear().toString().slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${KIND_PREFIX[kind]}-${ymd}-${rand}`;
}

const SLUG_ALLOWED = /[^a-z0-9]+/g;

export function slugify(s: string): string {
  if (!s) return "draft";
  const slug = s
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c]!)
    .replace(/ß/g, "ss")
    .replace(SLUG_ALLOWED, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "draft";
}

export function buildFilename(input: {
  id: string;
  name: string;
  date: string;
}): string {
  return `${input.date}_${input.id}_${slugify(input.name)}.json`;
}

/** Parse a stored draft filename back into its components. */
export function parseFilename(filename: string):
  | { date: string; id: string; slug: string }
  | null {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})_([A-Z0-9-]+)_(.+)\.json$/);
  if (!m) return null;
  return { date: m[1]!, id: m[2]!, slug: m[3]! };
}

function keyFor(filename: string): string {
  return `${DRAFTS_PREFIX}/${filename}`;
}

export async function listDrafts(): Promise<DraftRecord[]> {
  const entries = await store().list(DRAFTS_PREFIX);
  const out: DraftRecord[] = [];
  for (const entry of entries) {
    const filename = entry.pathname.slice(DRAFTS_PREFIX.length + 1);
    if (!filename.endsWith(".json")) continue;
    const raw = await store().get(entry.pathname);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as DraftFile;
      out.push({
        id: parsed.id,
        name: parsed.name,
        date: parsed.date,
        kind: parsed.kind ?? kindFromId(parsed.id),
        filename,
        updatedAt: entry.uploadedAt,
        problemPreview: (parsed.doc?.problem ?? "").slice(0, 140),
        articleName:
          parsed.doc?.customer?.articleName ||
          parsed.doc?.supplier?.articleName ||
          undefined,
        sizeBytes: entry.size,
      });
    } catch {
      // Skip malformed files without failing the whole list.
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

async function findFilenameById(id: string): Promise<string | null> {
  const entries = await store().list(DRAFTS_PREFIX);
  for (const entry of entries) {
    const filename = entry.pathname.slice(DRAFTS_PREFIX.length + 1);
    const parsed = parseFilename(filename);
    if (parsed?.id === id) return filename;
  }
  return null;
}

export async function loadDraft(id: string): Promise<DraftFile | null> {
  const filename = await findFilenameById(id);
  if (!filename) return null;
  const raw = await store().get(keyFor(filename));
  if (!raw) return null;
  return JSON.parse(raw) as DraftFile;
}

export async function saveDraft(input: {
  id?: string;
  name?: string;
  kind?: DraftKind;
  doc: EightDDoc;
  meta: FieldMetaMap;
}): Promise<DraftRecord> {
  const kind: DraftKind = input.kind ?? (input.id ? kindFromId(input.id) : "8D");
  const id = input.id ?? newDraftId(kind);
  const date = new Date().toISOString().slice(0, 10);
  const resolvedName =
    (input.name && input.name.trim()) ||
    input.doc?.supplier?.articleName ||
    input.doc?.customer?.articleName ||
    (input.doc?.problem ? input.doc.problem.slice(0, 60) : "") ||
    `${kind} report ${id}`;

  // If a draft with this id already exists under a different filename
  // (e.g. the name changed), delete the old key so we don't leave a
  // stale duplicate around.
  const existing = await findFilenameById(id);
  if (existing) {
    await store().remove(keyFor(existing));
  }

  const filename = buildFilename({ id, name: resolvedName, date });
  const payload: DraftFile = {
    id,
    name: resolvedName,
    date,
    kind,
    doc: input.doc,
    meta: input.meta,
    savedAt: new Date().toISOString(),
  };
  const body = JSON.stringify(payload, null, 2);
  await store().put(keyFor(filename), body);
  const savedAt = payload.savedAt;
  return {
    id,
    name: resolvedName,
    date,
    kind,
    filename,
    updatedAt: savedAt,
    problemPreview: (input.doc.problem ?? "").slice(0, 140),
    articleName:
      input.doc.customer?.articleName ||
      input.doc.supplier?.articleName ||
      undefined,
    sizeBytes: Buffer.byteLength(body, "utf8"),
  };
}

export async function deleteDraft(id: string): Promise<boolean> {
  const filename = await findFilenameById(id);
  if (!filename) return false;
  await store().remove(keyFor(filename));
  return true;
}
