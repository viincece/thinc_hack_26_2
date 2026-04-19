/**
 * Runs `tsx scripts/dump-kg-snapshot.ts` — unless we're on Vercel and
 * the committed snapshot is already present. Kuzu-wasm + a 172-node
 * walk adds 30-60 s to every Vercel deploy for zero gain: the JSONL
 * source of truth is committed, so a fresh dump would produce the
 * same file.
 *
 * Local dev still regenerates on every `npm run build`, so the
 * snapshot stays in sync with whatever you just appended to
 * wiki/events.jsonl.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const snapshotPath = path.join(process.cwd(), "public", "wiki-snapshot.json");

if (process.env.VERCEL && fs.existsSync(snapshotPath)) {
  const kb = Math.round(fs.statSync(snapshotPath).size / 1024);
  console.log(
    `↻ skipping KG snapshot regen on Vercel — using committed snapshot (${kb} kB).`,
  );
  console.log("  Set KG_FORCE_REGEN=1 if you ever need to override.");
  if (process.env.KG_FORCE_REGEN !== "1") process.exit(0);
}

const r = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsx", "scripts/dump-kg-snapshot.ts"],
  { stdio: "inherit" },
);
process.exit(r.status ?? 0);
