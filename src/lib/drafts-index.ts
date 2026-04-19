import { store } from "./storage/object-store";
import { DRAFTS_PREFIX, type DraftFile } from "./drafts";
import { REPORTS_PREFIX } from "./reports/store";
import type { IncidentReport } from "./reports/types";

/**
 * Reverse index from a Manex entity id (DEF-…, ACT-…, PRD-…) to the
 * user-authored drafts + incident analyses that mention it.
 *
 * The /incidents and /initiatives pages build this once per render so a
 * row can surface "this defect has an 8D draft" without hitting the
 * object store per row.
 *
 * Ids are mined from two places:
 *   - 8D drafts (`drafts/*.json`) — ids are only loosely structured,
 *     stored in `meta.<field>.source` strings and the free text of
 *     `doc.problem` / `doc.appreciation`. We regex-scan those.
 *   - Incident analyses (`reports/*.json`) — `source.defect_id` is
 *     explicit; product / part / article come from `facts`.
 */

export type DraftRef = {
  kind: "8D" | "Analysis";
  id: string; // "8D-260418-V74C" or "IR-260419-WKO7"
  name: string; // user-facing title
  href: string; // where to open it
  createdAt: string; // ISO timestamp (savedAt for drafts, generatedAt for reports)
};

export type DraftsIndex = {
  byDefect: Map<string, DraftRef[]>;
  byAction: Map<string, DraftRef[]>;
  byProduct: Map<string, DraftRef[]>;
};

const DEF_RE = /\bDEF-\d{4,6}\b/g;
const ACT_RE = /\bACT-\d{4,6}\b/g;
const PRD_RE = /\bPRD-\d{4,6}\b/g;

function walkStrings(value: unknown, emit: (s: string) => void): void {
  if (typeof value === "string") {
    emit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walkStrings(v, emit);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      walkStrings(v, emit);
    }
  }
}

function pushRef(
  map: Map<string, DraftRef[]>,
  key: string,
  ref: DraftRef,
): void {
  const existing = map.get(key);
  if (existing) {
    // Dedupe by (kind, id) so a draft that mentions a DEF twice only
    // appears once on the row.
    if (existing.some((e) => e.kind === ref.kind && e.id === ref.id)) return;
    existing.push(ref);
  } else {
    map.set(key, [ref]);
  }
}

async function indexEightD(out: DraftsIndex): Promise<void> {
  const entries = await store().list(DRAFTS_PREFIX);
  await Promise.all(
    entries
      .filter((e) => e.pathname.endsWith(".json"))
      .map(async (entry) => {
        const raw = await store().get(entry.pathname);
        if (!raw) return;
        let parsed: DraftFile;
        try {
          parsed = JSON.parse(raw) as DraftFile;
        } catch {
          return;
        }
        // Only index 8D drafts here — FMEA + Analysis kinds have their
        // own stores; we don't want duplicates on /initiatives.
        const kind = parsed.kind ?? "8D";
        if (kind !== "8D") return;

        const ref: DraftRef = {
          kind: "8D",
          id: parsed.id,
          name: parsed.name,
          href: `/report/new?draft=${encodeURIComponent(parsed.id)}`,
          // `savedAt` is the authoritative write timestamp captured at
          // save-time; falling back to the blob's upload time keeps
          // legacy files sortable.
          createdAt: parsed.savedAt ?? entry.uploadedAt,
        };

        const defects = new Set<string>();
        const actions = new Set<string>();
        const products = new Set<string>();
        walkStrings(parsed, (s) => {
          for (const m of s.matchAll(DEF_RE)) defects.add(m[0]);
          for (const m of s.matchAll(ACT_RE)) actions.add(m[0]);
          for (const m of s.matchAll(PRD_RE)) products.add(m[0]);
        });
        for (const d of defects) pushRef(out.byDefect, d, ref);
        for (const a of actions) pushRef(out.byAction, a, ref);
        for (const p of products) pushRef(out.byProduct, p, ref);
      }),
  );
}

async function indexAnalyses(out: DraftsIndex): Promise<void> {
  const entries = await store().list(REPORTS_PREFIX);
  await Promise.all(
    entries
      .filter((e) => e.pathname.endsWith(".json"))
      .map(async (entry) => {
        const raw = await store().get(entry.pathname);
        if (!raw) return;
        let parsed: IncidentReport;
        try {
          parsed = JSON.parse(raw) as IncidentReport;
        } catch {
          return;
        }

        const ref: DraftRef = {
          kind: "Analysis",
          id: parsed.id,
          name: parsed.name,
          href: `/reports/${encodeURIComponent(parsed.id)}`,
          createdAt: parsed.generatedAt,
        };

        const defects = new Set<string>();
        const actions = new Set<string>();
        const products = new Set<string>();
        // Explicit source first.
        if (parsed.source?.defect_id) defects.add(parsed.source.defect_id);
        walkStrings(parsed, (s) => {
          for (const m of s.matchAll(DEF_RE)) defects.add(m[0]);
          for (const m of s.matchAll(ACT_RE)) actions.add(m[0]);
          for (const m of s.matchAll(PRD_RE)) products.add(m[0]);
        });
        for (const d of defects) pushRef(out.byDefect, d, ref);
        for (const a of actions) pushRef(out.byAction, a, ref);
        for (const p of products) pushRef(out.byProduct, p, ref);
      }),
  );
}

/**
 * Build the reverse index from disk. Cheap enough to call once per
 * request — both draft stores stay well under a few hundred files.
 */
export async function buildDraftsIndex(): Promise<DraftsIndex> {
  const out: DraftsIndex = {
    byDefect: new Map(),
    byAction: new Map(),
    byProduct: new Map(),
  };
  await Promise.all([indexEightD(out), indexAnalyses(out)]);
  // Newest first on every row so the most recent draft is the one the
  // user sees first when a defect has multiple.
  for (const list of out.byDefect.values())
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const list of out.byAction.values())
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const list of out.byProduct.values())
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}
