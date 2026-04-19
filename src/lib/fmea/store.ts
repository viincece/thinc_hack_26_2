import { promises as fs } from "node:fs";
import path from "node:path";
import type { FmeaDoc } from "./types";

/**
 * FMEA drafts persist alongside 8D drafts + incident reports under
 * /public/<kind>/<id>.json. Kept in its own directory so the 8D
 * `DraftFile` shape stays untouched; both workspace rails merge the
 * lists client-side.
 */

export const FMEA_DIR = path.join(process.cwd(), "public", "fmea-drafts");

async function ensureDir() {
  await fs.mkdir(FMEA_DIR, { recursive: true });
}

export function newFmeaId(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ymd =
    d.getFullYear().toString().slice(2) +
    pad(d.getMonth() + 1) +
    pad(d.getDate());
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FMEA-${ymd}-${rand}`;
}

function filenameFor(id: string): string {
  return `${id}.json`;
}

export type FmeaSummary = {
  id: string;
  name: string;
  articleId: string;
  articleName?: string;
  rowCount: number;
  maxRpn: number;
  generatedAt: string;
  filename: string;
  sizeBytes: number;
};

export async function saveFmea(doc: FmeaDoc): Promise<FmeaSummary> {
  await ensureDir();
  const full = path.join(FMEA_DIR, filenameFor(doc.id));
  await fs.writeFile(full, JSON.stringify(doc, null, 2), "utf8");
  const stat = await fs.stat(full);
  return {
    id: doc.id,
    name: doc.name,
    articleId: doc.source.articleId,
    articleName: doc.source.articleName,
    rowCount: doc.rows.length,
    maxRpn: doc.rows.reduce((m, r) => Math.max(m, r.rpn), 0),
    generatedAt: doc.generatedAt,
    filename: filenameFor(doc.id),
    sizeBytes: stat.size,
  };
}

export async function loadFmea(id: string): Promise<FmeaDoc | null> {
  try {
    const raw = await fs.readFile(
      path.join(FMEA_DIR, filenameFor(id)),
      "utf8",
    );
    return JSON.parse(raw) as FmeaDoc;
  } catch {
    return null;
  }
}

export async function listFmeas(): Promise<FmeaSummary[]> {
  await ensureDir();
  const entries = await fs.readdir(FMEA_DIR).catch(() => []);
  const out: FmeaSummary[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const full = path.join(FMEA_DIR, name);
    try {
      const stat = await fs.stat(full);
      const raw = await fs.readFile(full, "utf8");
      const d = JSON.parse(raw) as FmeaDoc;
      out.push({
        id: d.id,
        name: d.name,
        articleId: d.source.articleId,
        articleName: d.source.articleName,
        rowCount: d.rows.length,
        maxRpn: d.rows.reduce((m, r) => Math.max(m, r.rpn), 0),
        generatedAt: d.generatedAt,
        filename: name,
        sizeBytes: stat.size,
      });
    } catch {
      /* skip malformed */
    }
  }
  out.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
  return out;
}

export async function deleteFmea(id: string): Promise<boolean> {
  try {
    await fs.unlink(path.join(FMEA_DIR, filenameFor(id)));
    return true;
  } catch {
    return false;
  }
}
