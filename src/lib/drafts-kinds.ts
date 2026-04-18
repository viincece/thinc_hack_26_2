/**
 * Client-safe subset of drafts.ts: just the kind type + constants so browser
 * bundles don't transitively import `node:fs`.
 */

export type DraftKind = "8D" | "FMEA" | "Analysis";

export const DRAFT_KINDS: DraftKind[] = ["8D", "FMEA", "Analysis"];
