/**
 * Runtime switch between the live Kuzu client and the static snapshot.
 *
 * On Vercel the serverless bundle can't reliably spawn the kuzu-wasm
 * worker, so every `browse` / `query` function falls back to reading
 * `public/wiki-snapshot.json`, which is generated at build time from
 * the local Kuzu DB (see `scripts/dump-kg-snapshot.ts`).
 *
 * Opt-out via `KG_FORCE_LIVE=1` — used by the snapshot dumper so it
 * always talks to the real Kuzu even when it runs inside a Vercel
 * build container.
 */
export function useSnapshot(): boolean {
  if (process.env.KG_FORCE_LIVE === "1") return false;
  if (process.env.KG_SNAPSHOT === "1") return true;
  return process.env.VERCEL === "1";
}
