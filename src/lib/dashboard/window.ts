/**
 * Window presets for the dashboard "Quality signals" KPI strip.
 *
 * A window here means *both* the range shown in each KPI tile *and*
 * the equal-length range immediately before it — used to compute the
 * delta displayed as "↑ 12 % vs previous 7 days".
 *
 * The window is carried in the URL as `?window=…` so the whole strip is
 * driven by plain SSR without any client-side state or data-fetching.
 */

export const WINDOW_KEYS = ["24h", "7d", "30d", "6m"] as const;
export type WindowKey = (typeof WINDOW_KEYS)[number];

export const DEFAULT_WINDOW: WindowKey = "30d";

export function parseWindow(raw: string | string[] | undefined): WindowKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (WINDOW_KEYS as readonly string[]).includes(v ?? "")
    ? (v as WindowKey)
    : DEFAULT_WINDOW;
}

/** Human-readable short label, used inline next to the section title. */
export const WINDOW_LABEL: Record<WindowKey, string> = {
  "24h": "last 24 h",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "6m": "last 6 months",
};

/** How far back the *current* window reaches. */
export const WINDOW_MS: Record<WindowKey, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "6m": 182 * 24 * 60 * 60 * 1000,
};

/**
 * How we split the current window into sparkline buckets. Keeping the
 * count in the 7–12 range so the sparkline reads cleanly at ~40 px tall.
 */
export const BUCKET_CONFIG: Record<
  WindowKey,
  { count: number; msPer: number; shortLabel: string }
> = {
  "24h": { count: 12, msPer: 2 * 60 * 60 * 1000, shortLabel: "2 h" },
  "7d": { count: 7, msPer: 24 * 60 * 60 * 1000, shortLabel: "daily" },
  "30d": { count: 10, msPer: 3 * 24 * 60 * 60 * 1000, shortLabel: "3 d" },
  "6m": { count: 12, msPer: 14 * 24 * 60 * 60 * 1000, shortLabel: "2 wk" },
};

/**
 * Build the bucket boundaries for the current window, as Unix ms.
 * Returns `count` buckets covering `[now - window, now]` in ascending
 * order. The last bucket's `end` is exactly `now`.
 */
export function bucketEdges(
  windowKey: WindowKey,
  now = Date.now(),
): Array<{ start: number; end: number }> {
  const { count, msPer } = BUCKET_CONFIG[windowKey];
  const total = count * msPer;
  const first = now - total;
  return Array.from({ length: count }, (_, i) => ({
    start: first + i * msPer,
    end: first + (i + 1) * msPer,
  }));
}

/**
 * Compute the "previous equal window" for delta calculations. The range
 * is `[now - 2W, now - W]`, i.e. the window immediately preceding the
 * current one.
 */
export function previousWindow(
  windowKey: WindowKey,
  now = Date.now(),
): { start: number; end: number } {
  const w = WINDOW_MS[windowKey];
  return { start: now - 2 * w, end: now - w };
}

export function currentWindow(
  windowKey: WindowKey,
  now = Date.now(),
): { start: number; end: number } {
  const w = WINDOW_MS[windowKey];
  return { start: now - w, end: now };
}

/**
 * Render a number as compact currency using a tiered short form:
 *   12 → "€ 12"
 *   1_234 → "€ 1,234"
 *   12_340 → "€ 12.3k"
 *   1_234_000 → "€ 1.23M"
 */
export function formatEurShort(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const a = Math.abs(amount);
  // Locale is pinned to en-US so the thousands separator is always a
  // comma. Without this, a Node process with a German LANG renders
  // "€ 1.146" which reads as "1 point 146" to English-first users.
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a < 10_000) {
    return `${sign}€ ${fmt(Math.round(a))}`;
  }
  if (a < 1_000_000) {
    const k = a / 1_000;
    return `${sign}€ ${k.toFixed(k >= 100 ? 0 : 1)}k`;
  }
  const m = a / 1_000_000;
  return `${sign}€ ${m.toFixed(m >= 100 ? 1 : 2)}M`;
}

/**
 * Delta between two scalars.
 *
 * `hint` controls which direction is "good":
 *   - "lower-better" (cost, defects): dropping is good, rising is bad.
 *   - "higher-better": flipped.
 *   - "neutral": no colour, just show the percentage.
 *
 * Returns `null` when the denominator is too small for the delta to be
 * meaningful — that way a 7-day window that went from 1 to 5 defects
 * doesn't read "+400 %".
 */
export type DeltaKind = "good" | "bad" | "flat" | "neutral";

export type DeltaSummary = {
  label: string;
  kind: DeltaKind;
};

export function computeDelta(
  current: number,
  previous: number,
  hint: "lower-better" | "higher-better" | "neutral" = "lower-better",
  minPrev = 5,
): DeltaSummary | null {
  if (previous < minPrev) return null;
  const diff = current - previous;
  const pct = (diff / previous) * 100;
  const abs = Math.abs(pct);
  // Sanity cap: if the denominator is small relative to the numerator
  // the percentage is mathematically correct but misleading — "+2300 %"
  // usually means "previous window has almost no history", not "the
  // line is on fire". Surface that explicitly instead of a shocking
  // number.
  if (abs > 300) {
    return { label: "too little history", kind: "neutral" };
  }
  if (abs < 1) {
    return { label: "flat vs prev", kind: "flat" };
  }
  const arrow = diff > 0 ? "↑" : "↓";
  const rounded = abs < 10 ? abs.toFixed(1) : Math.round(abs).toString();
  const label = `${arrow} ${rounded}% vs prev`;
  if (hint === "neutral") return { label, kind: "neutral" };
  const isGood =
    hint === "lower-better" ? diff < 0 : diff > 0;
  return { label, kind: isGood ? "good" : "bad" };
}
