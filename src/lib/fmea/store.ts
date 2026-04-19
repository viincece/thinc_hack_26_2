import { store } from "@/lib/storage/object-store";
import type { FmeaDoc } from "./types";

/**
 * FMEA drafts persist alongside 8D drafts + incident reports under
 * the object store's `fmea-drafts/` prefix. Kept in its own prefix so
 * the 8D `DraftFile` shape stays untouched; both workspace rails merge
 * the lists client-side.
 */

export const FMEA_PREFIX = "fmea-drafts";

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

function keyFor(id: string): string {
  return `${FMEA_PREFIX}/${filenameFor(id)}`;
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
  const body = JSON.stringify(doc, null, 2);
  await store().put(keyFor(doc.id), body);
  return {
    id: doc.id,
    name: doc.name,
    articleId: doc.source.articleId,
    articleName: doc.source.articleName,
    rowCount: doc.rows.length,
    maxRpn: doc.rows.reduce((m, r) => Math.max(m, r.rpn), 0),
    generatedAt: doc.generatedAt,
    filename: filenameFor(doc.id),
    sizeBytes: Buffer.byteLength(body, "utf8"),
  };
}

export async function loadFmea(id: string): Promise<FmeaDoc | null> {
  const raw = await store().get(keyFor(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FmeaDoc;
  } catch {
    return null;
  }
}

export async function listFmeas(): Promise<FmeaSummary[]> {
  const entries = await store().list(FMEA_PREFIX);
  const out: FmeaSummary[] = [];
  for (const entry of entries) {
    const name = entry.pathname.slice(FMEA_PREFIX.length + 1);
    if (!name.endsWith(".json")) continue;
    const raw = await store().get(entry.pathname);
    if (!raw) continue;
    try {
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
        sizeBytes: entry.size,
      });
    } catch {
      /* skip malformed */
    }
  }
  out.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
  return out;
}

export async function deleteFmea(id: string): Promise<boolean> {
  await store().remove(keyFor(id));
  return true;
}
