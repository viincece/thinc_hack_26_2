import { promises as fs } from "node:fs";
import path from "node:path";
import type { EightDDoc, FieldMetaMap } from "@/components/copilot/eight-d-doc";

export type DraftRecord = {
  id: string;
  name: string;
  date: string;
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
  doc: EightDDoc;
  meta: FieldMetaMap;
  savedAt: string;
};

export const DRAFTS_DIR = path.join(process.cwd(), "public", "drafts");

export async function ensureDraftsDir() {
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
}

/** 8D-YYMMDD-XXXX — short, collision-avoidant */
export function newDraftId(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ymd = `${d.getFullYear().toString().slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `8D-${ymd}-${rand}`;
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

export async function listDrafts(): Promise<DraftRecord[]> {
  await ensureDraftsDir();
  const entries = await fs.readdir(DRAFTS_DIR).catch(() => []);
  const out: DraftRecord[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const full = path.join(DRAFTS_DIR, name);
    try {
      const stat = await fs.stat(full);
      const raw = await fs.readFile(full, "utf8");
      const parsed = JSON.parse(raw) as DraftFile;
      out.push({
        id: parsed.id,
        name: parsed.name,
        date: parsed.date,
        filename: name,
        updatedAt: stat.mtime.toISOString(),
        problemPreview: (parsed.doc?.problem ?? "").slice(0, 140),
        articleName:
          parsed.doc?.customer?.articleName ||
          parsed.doc?.supplier?.articleName ||
          undefined,
        sizeBytes: stat.size,
      });
    } catch {
      // Skip malformed files without failing the whole list.
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

async function findFilenameById(id: string): Promise<string | null> {
  await ensureDraftsDir();
  const entries = await fs.readdir(DRAFTS_DIR).catch(() => []);
  for (const name of entries) {
    const parsed = parseFilename(name);
    if (parsed?.id === id) return name;
  }
  return null;
}

export async function loadDraft(id: string): Promise<DraftFile | null> {
  const filename = await findFilenameById(id);
  if (!filename) return null;
  const raw = await fs.readFile(path.join(DRAFTS_DIR, filename), "utf8");
  return JSON.parse(raw) as DraftFile;
}

export async function saveDraft(input: {
  id?: string;
  name?: string;
  doc: EightDDoc;
  meta: FieldMetaMap;
}): Promise<DraftRecord> {
  await ensureDraftsDir();
  const id = input.id ?? newDraftId();
  const date = new Date().toISOString().slice(0, 10);
  const resolvedName =
    (input.name && input.name.trim()) ||
    input.doc?.supplier?.articleName ||
    input.doc?.customer?.articleName ||
    (input.doc?.problem ? input.doc.problem.slice(0, 60) : "") ||
    `8D report ${id}`;

  // If a draft with this id already exists under a different filename
  // (e.g. the name changed), delete the old file so we don't duplicate.
  const existing = await findFilenameById(id);
  if (existing) {
    await fs.unlink(path.join(DRAFTS_DIR, existing)).catch(() => {});
  }

  const filename = buildFilename({ id, name: resolvedName, date });
  const payload: DraftFile = {
    id,
    name: resolvedName,
    date,
    doc: input.doc,
    meta: input.meta,
    savedAt: new Date().toISOString(),
  };
  const full = path.join(DRAFTS_DIR, filename);
  await fs.writeFile(full, JSON.stringify(payload, null, 2), "utf8");
  const stat = await fs.stat(full);
  return {
    id,
    name: resolvedName,
    date,
    filename,
    updatedAt: stat.mtime.toISOString(),
    problemPreview: (input.doc.problem ?? "").slice(0, 140),
    articleName:
      input.doc.customer?.articleName ||
      input.doc.supplier?.articleName ||
      undefined,
    sizeBytes: stat.size,
  };
}

export async function deleteDraft(id: string): Promise<boolean> {
  const filename = await findFilenameById(id);
  if (!filename) return false;
  await fs.unlink(path.join(DRAFTS_DIR, filename));
  return true;
}
