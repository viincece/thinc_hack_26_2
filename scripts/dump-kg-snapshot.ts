/**
 * Build-time snapshot of the knowledge graph.
 *
 * Runs the live Kuzu client (see web/wiki/events.jsonl) through every
 * query the wiki pages + agent tools use, then writes the aggregate to
 * `web/public/wiki-snapshot.json`. Next.js bundles the `public/` tree
 * verbatim, so the JSON is readable on Vercel at runtime via
 * `src/lib/kg/source.ts` — which is where `browse.ts` and `query.ts`
 * fall back to whenever `useSnapshot()` is true.
 *
 * Run:
 *   npm run snapshot           # dumps snapshot
 *
 * The script is wired to `prebuild` so every `next build` regenerates
 * the snapshot from whatever the local event log currently contains.
 */
import { config } from "dotenv";
import { promises as fs } from "node:fs";
import path from "node:path";

// Force-live for this process: we're the one feeding the snapshot,
// so Kuzu must actually execute. runtime.useSnapshot() reads this.
process.env.KG_FORCE_LIVE = "1";

config({ path: ".env.local" });
config({ path: ".env" });

import {
  graphAll,
  listConcepts,
  listEntities,
  listLog,
  listRecentObservations,
  listReports,
  listSources,
  nodeDetail,
  stats,
} from "../src/lib/kg/browse";
import { kg } from "../src/lib/kg/client";
import type { KgSnapshot } from "../src/lib/kg/source";

const OUT_FILE = path.join(process.cwd(), "public", "wiki-snapshot.json");

async function main() {
  const started = Date.now();
  console.log("→ Dumping KG snapshot from live Kuzu …");

  const [s, entities, concepts, observations, reports, sources, log, graph] =
    await Promise.all([
      stats(),
      listEntities(),
      listConcepts(),
      listRecentObservations(200),
      listReports(),
      listSources(),
      listLog(500),
      graphAll(),
    ]);

  console.log(
    `  • stats: ${s.entities} entities, ${s.concepts} concepts, ${s.observations} observations, ${s.reports} reports, ${s.sources} sources`,
  );
  console.log(`  • graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

  // Per-node detail for every node the graph knows about — one pass,
  // serial, so kuzu-wasm's single worker doesn't get hammered.
  const nodeDetails: KgSnapshot["nodeDetails"] = {};
  for (const n of graph.nodes) {
    try {
      nodeDetails[n.id] = await nodeDetail(n.id);
    } catch (e) {
      console.warn(
        `    (skip) nodeDetail(${n.id}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
  console.log(`  • node-details: ${Object.keys(nodeDetails).length}`);

  // Pack embeddings so hybrid search still has a vector to score
  // against — the runtime side (source.ts) skips the embed() call
  // itself, but the vectors are kept for completeness / future work.
  const embeddings = kg()
    .allEmbeddings()
    .map((e) => ({ id: e.id, vec: e.vec }));
  console.log(`  • embeddings: ${embeddings.length}`);

  const snapshot: KgSnapshot = {
    generatedAt: new Date().toISOString(),
    stats: s,
    entities,
    concepts,
    observations,
    reports,
    sources,
    log,
    graph,
    nodeDetails,
    embeddings,
  };

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(snapshot), "utf8");
  const kb = Math.round((await fs.stat(OUT_FILE)).size / 1024);
  console.log(
    `✓ Wrote ${path.relative(process.cwd(), OUT_FILE)}  (${kb} kB in ${Date.now() - started} ms)`,
  );
}

main().catch((e) => {
  console.error("✗ snapshot failed:", e);
  process.exit(1);
});
