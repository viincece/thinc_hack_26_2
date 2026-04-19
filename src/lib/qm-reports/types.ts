/**
 * Types for the "qm_reports" pipeline: shop-floor voice calls captured
 * by Sina (the phone agent) and transcribed upstream, plus the AI
 * summaries + extracted facts we cache locally.
 */

export type QmReportRaw = {
  id: number;
  telefonnummer?: string | null;
  datum?: string | null;       // DD.MM.YYYY in local TZ
  uhrzeit?: string | null;     // HH:MM
  dauer?: string | null;       // e.g. "0m 38s"
  transcript?: string | null;
  created_at: string;          // ISO UTC
};

/** Client-facing list row (safe to ship; drops nothing but adds a few
 *  pre-computed convenience fields). */
export type QmReportListItem = {
  id: number;
  phone: string | null;
  /** Preferred display time — ISO so the client formats per user locale. */
  receivedAt: string;
  durationSec: number | null;
  transcriptPreview: string;   // first ~200 chars, chat-stripped
  hasTranscript: boolean;
  /** If a cached summary exists, we ship a very short line; the subpage
   *  owns the rich version. */
  summaryShort: string | null;
  facts: QmFacts | null;
};

/** Status chip taxonomy — mirrors the 8D editor so we only have one
 *  visual language for "verified fact vs. AI guess vs. gap". */
export type QmFactStatus = "grounded" | "suggested" | "missing";

export type QmFact<T = string> = {
  value: T | null;
  status: QmFactStatus;
  /** Literal phrase from the transcript that supports the value. */
  source?: string;
  note?: string;
};

/**
 * Structured facts the LLM is allowed to extract. Every nullable field
 * gets a status so the UI can decide whether to render a chip or a
 * "missing" placeholder.
 */
export type QmFacts = {
  factory: QmFact<string>;
  line: QmFact<string>;
  section: QmFact<string>;
  article: QmFact<string>;
  part: QmFact<string>;
  defect_code: QmFact<string>;
  severity: QmFact<"low" | "medium" | "high" | "critical">;
  quantity: QmFact<number>;
  product_id: QmFact<string>;
  order_id: QmFact<string>;
  caller_role: QmFact<string>;
  keywords: QmFact<string[]>;
};

export type QmSummary = {
  reportId: number;
  summaryShort: string;        // 1 sentence
  summaryLong: string;         // markdown, 3–5 sentences
  facts: QmFacts;
  generatedAt: string;
  modelVersion?: string;
};

/** Full subpage payload: raw row + cached summary (may be null). */
export type QmReportDetail = {
  id: number;
  phone: string | null;
  receivedAt: string;
  durationSec: number | null;
  transcript: string;
  summary: QmSummary | null;
};
