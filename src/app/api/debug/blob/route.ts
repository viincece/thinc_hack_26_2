import { NextResponse } from "next/server";
import { backendName, store } from "@/lib/storage/object-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint for the object-store integration.
 *
 * Hitting `/api/debug/blob` on any deployment shows exactly what the
 * serverless function sees: which backend is live, whether the Vercel
 * Blob token is present, and the raw list of pathnames under each
 * prefix. If a draft / report / FMEA doesn't show on the sidepanel,
 * check here first — if the pathname is missing or shaped wrong, the
 * seed step didn't land in the store this env points at.
 */
export async function GET() {
  const prefixes = ["drafts", "reports", "fmea-drafts", "qm-summaries"];
  const hasToken = typeof process.env.BLOB_READ_WRITE_TOKEN === "string"
    && process.env.BLOB_READ_WRITE_TOKEN.length > 0;

  const listings: Record<string, { count: number; pathnames: string[] }> = {};
  for (const prefix of prefixes) {
    try {
      const entries = await store().list(prefix);
      listings[prefix] = {
        count: entries.length,
        pathnames: entries.map((e) => e.pathname).slice(0, 20),
      };
    } catch (e) {
      listings[prefix] = {
        count: -1,
        pathnames: [
          `error: ${e instanceof Error ? e.message : String(e)}`,
        ],
      };
    }
  }

  return NextResponse.json({
    backend: backendName(),
    hasBlobToken: hasToken,
    env: process.env.VERCEL_ENV ?? "local",
    listings,
  });
}
