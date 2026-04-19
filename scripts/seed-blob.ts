/**
 * One-shot uploader that copies every committed JSON fixture under
 * `web/public/<prefix>/*.json` into a Vercel Blob store.
 *
 *   drafts/         → 8D drafts
 *   reports/        → incident analyses
 *   fmea-drafts/    → FMEA drafts
 *   qm-summaries/   → voice-call AI summaries
 *
 * Run once, locally, after the Blob store is created on Vercel:
 *
 *   # 1. Copy the token from Vercel → project → Settings →
 *   #    Environment Variables into web/.env.local:
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
 *
 *   # 2. Run:
 *   npm run seed:blob
 *
 * Default is non-destructive: existing blobs with the same pathname
 * are re-uploaded (allowOverwrite: true) so running twice is safe, but
 * new blobs in the remote store that are not mirrored in public/ stay
 * put. Pass `--prune` to delete remote blobs that are NOT present
 * locally (strict mirror).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const PREFIXES = ["drafts", "reports", "fmea-drafts", "qm-summaries"] as const;

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("✗ BLOB_READ_WRITE_TOKEN is not set.");
    console.error("");
    console.error("Fix:");
    console.error("  1. Vercel → your project → Storage → open the Blob store.");
    console.error("  2. Click ⋮ → Environment Variables → copy BLOB_READ_WRITE_TOKEN.");
    console.error("  3. Paste into web/.env.local:");
    console.error("     BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...");
    console.error("  4. Re-run this script.");
    process.exit(1);
  }

  const prune = process.argv.includes("--prune");
  const { put, list, del } = await import("@vercel/blob");

  console.log("→ Seeding Vercel Blob from web/public/** …");
  console.log(`  mode: ${prune ? "mirror (will delete stale remote blobs)" : "additive (keep remote-only)"}`);

  const localKeys = new Set<string>();
  let totalBytes = 0;
  let uploaded = 0;
  let skippedEmpty = 0;

  for (const prefix of PREFIXES) {
    const dir = path.join(process.cwd(), "public", prefix);
    const names = await fs.readdir(dir).catch(() => []);
    if (!names.length) {
      console.log(`  · ${prefix}/ — no files in public, skipping`);
      continue;
    }
    console.log(`  · ${prefix}/ — ${names.length} file(s)`);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const pathname = `${prefix}/${name}`;
      const full = path.join(dir, name);
      const body = await fs.readFile(full, "utf8").catch(() => null);
      if (body == null) {
        console.warn(`    (skip) ${pathname}: unreadable`);
        skippedEmpty++;
        continue;
      }
      try {
        await put(pathname, body, {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json; charset=utf-8",
          token,
        });
        localKeys.add(pathname);
        uploaded++;
        totalBytes += Buffer.byteLength(body, "utf8");
        console.log(
          `    ✓ ${pathname}  (${Math.round(Buffer.byteLength(body, "utf8") / 1024)} kB)`,
        );
      } catch (e) {
        console.warn(
          `    ✗ ${pathname}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  if (prune) {
    console.log("→ Pruning remote blobs not mirrored locally …");
    let cursor: string | undefined;
    let deleted = 0;
    for (const prefix of PREFIXES) {
      const prefixSlash = `${prefix}/`;
      do {
        const page = await list({
          prefix: prefixSlash,
          cursor,
          token,
          limit: 1000,
        });
        for (const b of page.blobs) {
          if (!localKeys.has(b.pathname)) {
            await del(b.url, { token });
            deleted++;
            console.log(`    – ${b.pathname}`);
          }
        }
        cursor = page.cursor;
      } while (cursor);
    }
    console.log(`  ${deleted} deleted.`);
  }

  console.log("");
  console.log(
    `✓ Done. ${uploaded} uploaded · ${Math.round(totalBytes / 1024)} kB · ${skippedEmpty} skipped`,
  );
}

main().catch((e) => {
  console.error("✗ seed-blob failed:", e);
  process.exit(1);
});
