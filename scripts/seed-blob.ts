/**
 * One-shot uploader that copies every committed fixture under
 * `web/public/<prefix>/*` into a Vercel Blob store. Supports both
 * JSON (text) and PNG (binary) payloads:
 *
 *   drafts/         → 8D drafts                   (.json)
 *   reports/        → incident analyses           (.json)
 *   fmea-drafts/    → FMEA drafts                 (.json)
 *   qm-summaries/   → voice-call AI summaries     (.json)
 *   defect_images/  → defect reference photos     (.png)
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

type Ext = "json" | "png";

type Descriptor = {
  prefix: string;
  exts: Ext[];
  contentType: (ext: Ext) => string;
};

const CONTENT_TYPE: Record<Ext, string> = {
  json: "application/json; charset=utf-8",
  png: "image/png",
};

const DESCRIPTORS: Descriptor[] = [
  {
    prefix: "drafts",
    exts: ["json"],
    contentType: (e) => CONTENT_TYPE[e],
  },
  {
    prefix: "reports",
    exts: ["json"],
    contentType: (e) => CONTENT_TYPE[e],
  },
  {
    prefix: "fmea-drafts",
    exts: ["json"],
    contentType: (e) => CONTENT_TYPE[e],
  },
  {
    prefix: "qm-summaries",
    exts: ["json"],
    contentType: (e) => CONTENT_TYPE[e],
  },
  {
    prefix: "defect_images",
    exts: ["png"],
    contentType: (e) => CONTENT_TYPE[e],
  },
];

function extOf(name: string): Ext | null {
  const m = name.toLowerCase().match(/\.([^.]+)$/);
  if (!m) return null;
  const e = m[1] as Ext;
  return e === "json" || e === "png" ? e : null;
}

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
  console.log(
    `  mode: ${prune ? "mirror (will delete stale remote blobs)" : "additive (keep remote-only)"}`,
  );

  const localKeys = new Set<string>();
  let totalBytes = 0;
  let uploaded = 0;
  let skipped = 0;

  for (const desc of DESCRIPTORS) {
    const dir = path.join(process.cwd(), "public", desc.prefix);
    const names = await fs.readdir(dir).catch(() => []);
    if (!names.length) {
      console.log(`  · ${desc.prefix}/ — no files in public, skipping`);
      continue;
    }
    console.log(`  · ${desc.prefix}/ — ${names.length} file(s)`);
    for (const name of names) {
      const ext = extOf(name);
      if (!ext || !desc.exts.includes(ext)) continue;
      const pathname = `${desc.prefix}/${name}`;
      const full = path.join(dir, name);
      try {
        const body =
          ext === "json"
            ? await fs.readFile(full, "utf8")
            : await fs.readFile(full); // binary Buffer for PNGs
        await put(pathname, body, {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: desc.contentType(ext),
          token,
        });
        const size =
          typeof body === "string"
            ? Buffer.byteLength(body, "utf8")
            : body.byteLength;
        localKeys.add(pathname);
        uploaded++;
        totalBytes += size;
        console.log(`    ✓ ${pathname}  (${Math.round(size / 1024)} kB)`);
      } catch (e) {
        skipped++;
        console.warn(
          `    ✗ ${pathname}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  if (prune) {
    console.log("→ Pruning remote blobs not mirrored locally …");
    let deleted = 0;
    for (const desc of DESCRIPTORS) {
      const prefixSlash = `${desc.prefix}/`;
      let cursor: string | undefined;
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
    `✓ Done. ${uploaded} uploaded · ${Math.round(totalBytes / 1024)} kB · ${skipped} skipped`,
  );
}

main().catch((e) => {
  console.error("✗ seed-blob failed:", e);
  process.exit(1);
});
