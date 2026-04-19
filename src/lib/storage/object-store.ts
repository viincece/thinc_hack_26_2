/**
 * Tiny object-storage abstraction shared by every JSON store in the app
 * (drafts, reports, FMEA drafts, QM summaries).
 *
 * Two backends:
 *
 *  1. **Vercel Blob** — used automatically when `BLOB_READ_WRITE_TOKEN`
 *     is set (Vercel injects this after you create a Blob Store in the
 *     dashboard and link it to the project).
 *  2. **Local filesystem** — default for `npm run dev` or any host with
 *     a writable disk (Railway, Fly, a VPS). Writes land under
 *     `<cwd>/public/<prefix>/<pathname>` so the existing committed
 *     fixtures keep working untouched.
 *
 * Both backends expose the same four methods — put / get / list /
 * remove — so callers don't care which one is live.
 *
 * All three store modules call this; none of them touch `node:fs`
 * directly anymore, which is what unblocks writes on Vercel's
 * read-only serverless filesystem.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

export type BlobEntry = {
  /** Same shape Vercel Blob uses: full key including any `prefix/`. */
  pathname: string;
  size: number;
  uploadedAt: string;
};

export interface ObjectStore {
  put(pathname: string, body: string): Promise<void>;
  get(pathname: string): Promise<string | null>;
  list(prefix: string): Promise<BlobEntry[]>;
  remove(pathname: string): Promise<void>;
}

/* -------------------------------------------------------------- *
 *  Local filesystem — dev default
 * -------------------------------------------------------------- */

class LocalStore implements ObjectStore {
  constructor(private readonly root: string) {}

  private full(p: string): string {
    return path.join(this.root, p);
  }

  async put(pathname: string, body: string): Promise<void> {
    const full = this.full(pathname);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body, "utf8");
  }

  async get(pathname: string): Promise<string | null> {
    try {
      return await fs.readFile(this.full(pathname), "utf8");
    } catch {
      return null;
    }
  }

  async list(prefix: string): Promise<BlobEntry[]> {
    const dir = this.full(prefix);
    const names = await fs.readdir(dir).catch(() => []);
    const out: BlobEntry[] = [];
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const full = path.join(dir, name);
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;
        out.push({
          pathname: path.posix.join(prefix, name),
          size: stat.size,
          uploadedAt: stat.mtime.toISOString(),
        });
      } catch {
        /* skip */
      }
    }
    return out;
  }

  async remove(pathname: string): Promise<void> {
    await fs.unlink(this.full(pathname)).catch(() => {});
  }
}

/* -------------------------------------------------------------- *
 *  Vercel Blob — production on Vercel
 * -------------------------------------------------------------- */

class VercelBlobStore implements ObjectStore {
  async put(pathname: string, body: string): Promise<void> {
    const { put } = await import("@vercel/blob");
    await put(pathname, body, {
      // `public` here means the URL doesn't need a signed token to
      // fetch — the JSON is still only discoverable through our API
      // routes, which is how the UI reads it. Swap to `access:
      // "private"` if we ever ship customer-identifying data.
      access: "public",
      // Keep the filename stable — the stores key off `pathname`, so
      // `addRandomSuffix: true` would break lookups.
      addRandomSuffix: false,
      // Vercel Blob errors on overwrite-by-default; draft/report
      // writes are idempotent by id so we always opt into overwrite.
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
    });
  }

  async get(pathname: string): Promise<string | null> {
    const { head } = await import("@vercel/blob");
    try {
      const meta = await head(pathname);
      const res = await fetch(meta.url);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      // head() throws BlobNotFoundError on 404 — treat as "no data".
      return null;
    }
  }

  async list(prefix: string): Promise<BlobEntry[]> {
    const { list } = await import("@vercel/blob");
    const out: BlobEntry[] = [];
    let cursor: string | undefined;
    // `prefix` must end in `/` for Vercel Blob to treat it as a
    // folder; we add one defensively.
    const p = prefix.endsWith("/") ? prefix : `${prefix}/`;
    do {
      const page = await list({ prefix: p, cursor, limit: 1000 });
      for (const b of page.blobs) {
        out.push({
          pathname: b.pathname,
          size: b.size,
          uploadedAt:
            b.uploadedAt instanceof Date
              ? b.uploadedAt.toISOString()
              : String(b.uploadedAt),
        });
      }
      cursor = page.cursor;
    } while (cursor);
    return out;
  }

  async remove(pathname: string): Promise<void> {
    const { del } = await import("@vercel/blob");
    await del(pathname).catch(() => {
      /* swallow — deleting a missing key is fine */
    });
  }
}

/* -------------------------------------------------------------- *
 *  Factory — one instance per process
 * -------------------------------------------------------------- */

let _store: ObjectStore | null = null;

/**
 * Pick the backend once per process.
 *
 * Auto-selects Vercel Blob when the Vercel-injected
 * `BLOB_READ_WRITE_TOKEN` is present. Opt in manually by setting the
 * same env var in `.env.local`; opt out by setting
 * `OBJECT_STORE=local`.
 */
export function store(): ObjectStore {
  if (_store) return _store;
  const forceLocal = process.env.OBJECT_STORE === "local";
  if (!forceLocal && process.env.BLOB_READ_WRITE_TOKEN) {
    _store = new VercelBlobStore();
  } else {
    _store = new LocalStore(path.join(process.cwd(), "public"));
  }
  return _store;
}

export function backendName(): "vercel-blob" | "local-fs" {
  const s = store();
  return s instanceof VercelBlobStore ? "vercel-blob" : "local-fs";
}
