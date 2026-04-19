import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { getQmReport } from "./manex";
import { saveSummary } from "./store";
import type { QmFact, QmFactStatus, QmFacts, QmSummary } from "./types";

/**
 * Ask the LLM to turn a raw call transcript into a short summary,
 * a longer markdown summary, and a structured set of facts with
 * per-field `grounded` / `suggested` / `missing` status chips.
 *
 * Guardrails live on this side, not in the prompt alone:
 *  - If the model returns something not matching our expected shape, we
 *    fall back to "missing" for every field rather than trusting a
 *    malformed fact.
 *  - "grounded" requires a non-empty `source` phrase from the transcript.
 *    We downgrade to "suggested" if the model claimed grounded without a
 *    quote, and to "missing" if the value is empty or null.
 */
export async function extractAndSaveSummary(
  id: number,
): Promise<QmSummary | null> {
  const report = await getQmReport(id);
  if (!report) return null;
  const transcript = (report.transcript ?? "").trim();
  if (!transcript) {
    const summary: QmSummary = {
      reportId: id,
      summaryShort: "Call ended before any content was captured.",
      summaryLong:
        "The voice agent recorded the call but the transcript is empty, so no facts could be extracted.",
      facts: emptyFacts(),
      generatedAt: new Date().toISOString(),
      modelVersion: AGENT_MODEL,
    };
    await saveSummary(summary);
    return summary;
  }

  const system = `You are a quality engineer's silent note-taker. You read a German phone-call transcript between a shop-floor worker ("User") and the plant's voice agent Sina ("Agent"), and distil it into structured JSON.

Rules:
- NEVER invent IDs, numbers, or names. If the transcript does not state a value, leave it out.
- Shop-floor vocabulary — "Linie 2" → line "Montage Linie 2"; "Station 3" → section; "500er" / "PowerCore 500" → article; "Kratzer"/"Kratzer und so weiter" → cosmetic/visual defect; "scheiße gelötet"/"fataler Fehler" → SOLDER_COLD + severity critical; "nicht so gravierend" → severity low.
- severity must be one of low | medium | high | critical.
- Output VALID JSON ONLY — no markdown fences, no prose before or after.
- Every fact key must have: { "value": <string|number|null>, "source": "<literal quote from the transcript, German OK, or empty string>" }.
- If the transcript is ambiguous but leans towards a value, include it; leaving "source" empty tells the app to mark it as suggested rather than grounded.
- summaryShort: ONE sentence, ≤ 140 chars, in English.
- summaryLong: 2-4 sentences in English, markdown allowed (**bold**, bullet lists), mention the defect impact and any stop-the-bleed action the worker already took.

Return exactly this JSON schema:
{
  "summaryShort": string,
  "summaryLong": string,
  "facts": {
    "factory":     { "value": string | null, "source": string },
    "line":        { "value": string | null, "source": string },
    "section":     { "value": string | null, "source": string },
    "article":     { "value": string | null, "source": string },
    "part":        { "value": string | null, "source": string },
    "defect_code": { "value": string | null, "source": string },
    "severity":    { "value": "low"|"medium"|"high"|"critical"|null, "source": string },
    "quantity":    { "value": number | null, "source": string },
    "product_id":  { "value": string | null, "source": string },
    "order_id":    { "value": string | null, "source": string },
    "caller_role": { "value": string | null, "source": string },
    "keywords":    { "value": string[] | null, "source": string }
  }
}`;

  const userPrompt = `Transcript:\n\n"""\n${transcript}\n"""`;

  const client = anthropic();
  const resp = await client.messages.create({
    model: AGENT_MODEL,
    max_tokens: 1600,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Concatenate text blocks; the prompt disallows tool use here.
  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const parsed = safeParse(text);
  const facts = normaliseFacts(parsed?.facts, transcript);

  const summary: QmSummary = {
    reportId: id,
    summaryShort: typeof parsed?.summaryShort === "string"
      ? parsed.summaryShort.trim()
      : fallbackShort(transcript),
    summaryLong: typeof parsed?.summaryLong === "string"
      ? parsed.summaryLong.trim()
      : "Summary unavailable — the extractor returned no long description.",
    facts,
    generatedAt: new Date().toISOString(),
    modelVersion: AGENT_MODEL,
  };
  await saveSummary(summary);
  return summary;
}

/* -------------------------------------------------------------- *
 *  Parsing helpers — defensive because a stray ``` can break JSON.
 * -------------------------------------------------------------- */

type RawFact = { value: unknown; source?: unknown };
type RawFacts = Partial<Record<keyof QmFacts, RawFact>>;

function safeParse(text: string):
  | { summaryShort?: unknown; summaryLong?: unknown; facts?: RawFacts }
  | null {
  const stripped = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Try to salvage by locating the first '{' and last '}'
    const first = stripped.indexOf("{");
    const last = stripped.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(stripped.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function fact<T>(raw: RawFact | undefined, transcript: string): QmFact<T> {
  const value = raw?.value;
  const source = typeof raw?.source === "string" ? raw.source.trim() : "";
  const present =
    value !== null &&
    value !== undefined &&
    !(typeof value === "string" && value.trim() === "") &&
    !(Array.isArray(value) && value.length === 0);
  if (!present) {
    return { value: null, status: "missing" as QmFactStatus };
  }
  // Grounded requires the source phrase to actually appear in the
  // transcript (fuzzy: substring, case-insensitive on letters only).
  const grounded = source.length > 0 && fuzzyContains(transcript, source);
  return {
    value: value as T,
    status: grounded ? "grounded" : "suggested",
    source: source.length > 0 ? source : undefined,
  };
}

function fuzzyContains(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const n = needle.toLowerCase().replace(/[^a-z0-9äöüß ]+/gi, " ").trim();
  const h = haystack.toLowerCase().replace(/[^a-z0-9äöüß ]+/gi, " ");
  if (!n) return false;
  // Require at least one meaningful token to match.
  for (const tok of n.split(/\s+/).filter((t) => t.length >= 3)) {
    if (h.includes(tok)) return true;
  }
  return false;
}

function normaliseFacts(raw: RawFacts | undefined, transcript: string): QmFacts {
  return {
    factory: fact<string>(raw?.factory, transcript),
    line: fact<string>(raw?.line, transcript),
    section: fact<string>(raw?.section, transcript),
    article: fact<string>(raw?.article, transcript),
    part: fact<string>(raw?.part, transcript),
    defect_code: fact<string>(raw?.defect_code, transcript),
    severity: normSeverity(raw?.severity, transcript),
    quantity: normQuantity(raw?.quantity, transcript),
    product_id: fact<string>(raw?.product_id, transcript),
    order_id: fact<string>(raw?.order_id, transcript),
    caller_role: fact<string>(raw?.caller_role, transcript),
    keywords: fact<string[]>(raw?.keywords, transcript),
  };
}

function normSeverity(
  raw: RawFact | undefined,
  transcript: string,
): QmFact<"low" | "medium" | "high" | "critical"> {
  const v = raw?.value;
  if (typeof v === "string") {
    const vv = v.toLowerCase().trim();
    if (["low", "medium", "high", "critical"].includes(vv)) {
      return fact<"low" | "medium" | "high" | "critical">(
        { value: vv, source: raw?.source },
        transcript,
      );
    }
  }
  return { value: null, status: "missing" };
}

function normQuantity(
  raw: RawFact | undefined,
  transcript: string,
): QmFact<number> {
  const v = raw?.value;
  const num = typeof v === "number" ? v : Number(v);
  if (Number.isFinite(num) && num > 0) {
    return fact<number>({ value: num, source: raw?.source }, transcript);
  }
  return { value: null, status: "missing" };
}

function emptyFacts(): QmFacts {
  const none = { value: null, status: "missing" as QmFactStatus };
  return {
    factory: none,
    line: none,
    section: none,
    article: none,
    part: none,
    defect_code: none,
    severity: none,
    quantity: none,
    product_id: none,
    order_id: none,
    caller_role: none,
    keywords: none,
  };
}

function fallbackShort(transcript: string): string {
  const user = transcript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^user\s*:/i.test(l));
  return user ? user.replace(/^user\s*:\s*/i, "").slice(0, 140) : "Voice report captured.";
}
