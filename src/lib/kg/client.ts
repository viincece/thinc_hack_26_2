/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import type { KgEvent } from "./types";

/**
 * Singleton Kuzu client.
 *
 * Architecture:
 *   • Database lives in memory (kuzu-wasm).
 *   • Persistence = append-only JSONL event log at <WIKI_DATA_DIR>/events.jsonl.
 *   • On first use we create the schema and replay the log.
 *   • Every mutation goes through `append(event)` which writes to disk AND
 *     materializes into Kuzu.
 *   • Embeddings for nodes are kept in a parallel in-memory Map (no Kuzu
 *     vector extension needed; cosine sim is done in JS at hackathon scale).
 */

type KuzuConn = any;
type KuzuDb = any;
type KuzuMod = any;

declare global {
  // eslint-disable-next-line no-var
  var __kg_client: KgClient | undefined;
  // eslint-disable-next-line no-var
  var __kg_rej: boolean | undefined;
  // eslint-disable-next-line no-var
  var __kg_mod: KuzuMod | undefined;
  // eslint-disable-next-line no-var
  var __kg_listeners_bumped: boolean | undefined;
}

/**
 * Markers in error strings that mean "the DB is toast, rebuild it".
 * Next.js dev HMR reloads kuzu-wasm workers which leaks listeners and pins
 * buffer-pool pages. When any of these phrases appear we tear the Database
 * down, rebuild the schema, replay the JSONL log, and retry the query once.
 */
const FATAL_KUZU_MARKERS = [
  "Buffer manager exception",
  "dispatcher is not defined",
  "Worker terminated",
  "Cannot read properties of null",
  "Kuzu connection not ready",
];

function isFatalKuzuError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return FATAL_KUZU_MARKERS.some((m) => msg.includes(m));
}

export class KgClient {
  private _initPromise: Promise<void> | null = null;
  private _mod: KuzuMod | null = null;
  private _db: KuzuDb | null = null;
  private _conn: KuzuConn | null = null;
  private _logPath = "";
  private _embeddings: Map<string, number[]> = new Map();

  async init(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._init();
    return this._initPromise;
  }

  private async _init() {
    // Silence the harmless kuzu-wasm `unhandledRejection: dispatcher is not
    // defined` spam that floods the Next dev overlay.
    if (typeof process !== "undefined" && process.on && !global.__kg_rej) {
      process.on("unhandledRejection", (reason) => {
        const msg = reason instanceof Error ? reason.message : String(reason);
        if (msg.includes("dispatcher is not defined")) return;
      });
      global.__kg_rej = true;
    }

    // Raise the EventEmitter listener cap on the process / workers.
    // tiny-worker (a kuzu-wasm dep) attaches one listener per message; under
    // HMR these accumulate and trigger MaxListenersExceededWarning at 11.
    if (
      typeof process !== "undefined" &&
      typeof (process as unknown as { setMaxListeners?: (n: number) => void })
        .setMaxListeners === "function" &&
      !global.__kg_listeners_bumped
    ) {
      (
        process as unknown as { setMaxListeners: (n: number) => void }
      ).setMaxListeners(100);
      try {
        const { EventEmitter } = await import("node:events");
        EventEmitter.defaultMaxListeners = 100;
      } catch {
        /* ignore */
      }
      global.__kg_listeners_bumped = true;
    }

    const mod = await loadKuzu();
    await mod.init();
    this._mod = mod;
    // Database(path, bufferPoolSize, maxNumThreads, enableCompression,
    //          readOnly, autoCheckpoint, checkpointThreshold)
    // Default buffer pool is tiny (~8 MB) — way too small under HMR churn.
    // 512 MB gives plenty of headroom + the self-healing fallback below.
    this._db = new mod.Database(":memory:", 512 * 1024 * 1024);
    this._conn = new mod.Connection(this._db);
    await this._createSchema();

    const dir = path.resolve(env.wikiDataDir());
    fs.mkdirSync(dir, { recursive: true });
    this._logPath = path.join(dir, "events.jsonl");
    if (fs.existsSync(this._logPath)) {
      const raw = fs.readFileSync(this._logPath, "utf-8");
      const lines = raw.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const ev = JSON.parse(line) as KgEvent;
          await this._apply(ev);
        } catch (e) {
          console.warn("[kg] skipping malformed event:", e);
        }
      }
    }
  }

  /**
   * Tear down the current Database + Connection and rebuild from scratch.
   * Replays the JSONL log so we come back fully populated. Called when we
   * detect a fatal kuzu-wasm error (OOM buffer, dispatcher race, etc.).
   */
  private async _heal(): Promise<void> {
    console.warn("[kg] self-healing: rebuilding in-memory Kuzu database");
    // Best-effort close, ignore failures.
    try {
      if (this._conn && typeof this._conn.close === "function") {
        await this._conn.close();
      }
    } catch {
      /* ignore */
    }
    try {
      if (this._db && typeof this._db.close === "function") {
        await this._db.close();
      }
    } catch {
      /* ignore */
    }
    this._conn = null;
    this._db = null;
    this._embeddings = new Map();
    this._initPromise = null;
    await this.init();
  }

  private async _createSchema() {
    const ddl = [
      `CREATE NODE TABLE Entity(
         id STRING, kind STRING, label STRING, body STRING,
         manex_table STRING, manex_id STRING, updated_at STRING,
         PRIMARY KEY (id))`,
      `CREATE NODE TABLE Concept(
         id STRING, title STRING, body STRING, updated_at STRING,
         PRIMARY KEY (id))`,
      `CREATE NODE TABLE Observation(
         id STRING, text STRING, confidence DOUBLE,
         first_seen STRING, last_confirmed STRING, superseded BOOL,
         PRIMARY KEY (id))`,
      `CREATE NODE TABLE Report(
         id STRING, report_kind STRING, title STRING, body STRING,
         status STRING, author STRING, created_at STRING, closed_at STRING,
         PRIMARY KEY (id))`,
      `CREATE NODE TABLE Source(
         id STRING, source_kind STRING, title STRING, url STRING,
         body STRING, ingested_at STRING,
         PRIMARY KEY (id))`,
      `CREATE NODE TABLE LogEntry(
         id STRING, ts STRING, action STRING, summary STRING,
         PRIMARY KEY (id))`,
      `CREATE REL TABLE ABOUT_ENTITY(FROM Observation TO Entity)`,
      `CREATE REL TABLE ABOUT_CONCEPT(FROM Observation TO Concept)`,
      `CREATE REL TABLE REPORT_ABOUT_ENTITY(FROM Report TO Entity)`,
      `CREATE REL TABLE REPORT_ABOUT_CONCEPT(FROM Report TO Concept)`,
      `CREATE REL TABLE EVIDENCED_BY(FROM Observation TO Source)`,
      `CREATE REL TABLE CITES_MANEX(FROM Observation TO Entity,
         tbl STRING, row_id STRING)`,
      `CREATE REL TABLE CONTAINS(FROM Report TO Observation)`,
      `CREATE REL TABLE STRUCTURAL(FROM Entity TO Entity,
         rel STRING)`,
      `CREATE REL TABLE CAUSED_BY(FROM Concept TO Concept)`,
      `CREATE REL TABLE SUBTYPE_OF(FROM Concept TO Concept)`,
      `CREATE REL TABLE INDICATED_BY(FROM Concept TO Entity)`,
    ];
    for (let i = 0; i < ddl.length; i++) {
      try {
        await this._exec(ddl[i]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Schema DDL #${i} failed: ${msg}\nStatement:\n${ddl[i]}`);
      }
    }
  }

  /** Low-level query that does NOT call init (avoids deadlock during setup). */
  private async _exec(cypher: string, params?: Record<string, unknown>) {
    if (!this._conn) throw new Error("Kuzu connection not ready");
    if (params && Object.keys(params).length) {
      const prep = await this._conn.prepare(cypher);
      return this._conn.execute(prep, params);
    }
    return this._conn.query(cypher);
  }

  async run(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    await this.init();
    try {
      return await this._runAfterInit(cypher, params);
    } catch (e) {
      if (isFatalKuzuError(e)) {
        await this._heal();
        // One retry after heal. If it still fails we surface the error so
        // the caller can show a friendly message.
        return this._runAfterInit(cypher, params);
      }
      throw e;
    }
  }

  private async _runAfterInit(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const r = await this._exec(cypher, params);
    if (r.isSuccess && r.isSuccess() === false) {
      const err = await r.getErrorMessage?.();
      throw new Error(`Kuzu error: ${err ?? "unknown"}`);
    }
    return (await r.getAllObjects()) as Record<string, unknown>[];
  }

  /**
   * Append an event to the persistent log AND apply it to the in-memory db.
   * Keep this as the only mutation path so disk and Kuzu never diverge.
   */
  async append(event: KgEvent): Promise<void> {
    await this.init();
    await this._apply(event);
    fs.appendFileSync(this._logPath, JSON.stringify(event) + "\n");
  }

  /** In-memory embedding store keyed by node id. */
  setEmbedding(id: string, vec: number[] | null) {
    if (vec) this._embeddings.set(id, vec);
  }
  getEmbedding(id: string): number[] | null {
    return this._embeddings.get(id) ?? null;
  }
  allEmbeddings(): Array<{ id: string; vec: number[] }> {
    return [...this._embeddings.entries()].map(([id, vec]) => ({ id, vec }));
  }

  private async _apply(ev: KgEvent): Promise<void> {
    const now = new Date().toISOString();
    switch (ev.kind) {
      case "entity":
        await this._runAfterInit(
          `MERGE (n:Entity {id: $id})
           SET n.kind=$kind, n.label=$label, n.body=$body,
               n.manex_table=$manex_table, n.manex_id=$manex_id,
               n.updated_at=$now`,
          {
            id: ev.id,
            kind: ev.entity_kind,
            label: ev.label,
            body: ev.body ?? "",
            manex_table: ev.manex_table ?? "",
            manex_id: ev.manex_id ?? "",
            now,
          },
        );
        return;
      case "concept":
        await this._runAfterInit(
          `MERGE (n:Concept {id: $id})
           SET n.title=$title, n.body=$body, n.updated_at=$now`,
          { id: ev.id, title: ev.title, body: ev.body ?? "", now },
        );
        return;
      case "source":
        await this._runAfterInit(
          `MERGE (n:Source {id: $id})
           SET n.source_kind=$k, n.title=$title, n.url=$url,
               n.body=$body, n.ingested_at=$now`,
          {
            id: ev.id,
            k: ev.source_kind,
            title: ev.title,
            url: ev.url ?? "",
            body: ev.body ?? "",
            now,
          },
        );
        return;
      case "observation":
        await this._runAfterInit(
          `MERGE (n:Observation {id: $id})
           SET n.text=$text, n.confidence=$conf,
               n.first_seen=$first, n.last_confirmed=$last,
               n.superseded=false`,
          {
            id: ev.id,
            text: ev.text,
            conf: ev.confidence,
            first: ev.first_seen,
            last: ev.last_confirmed ?? ev.first_seen,
          },
        );
        for (const eid of ev.about_entities ?? []) {
          await this._runAfterInit(
            `MATCH (o:Observation {id: $oid}), (e:Entity {id: $eid})
             MERGE (o)-[:ABOUT_ENTITY]->(e)`,
            { oid: ev.id, eid },
          );
        }
        for (const cid of ev.about_concepts ?? []) {
          await this._runAfterInit(
            `MATCH (o:Observation {id: $oid}), (c:Concept {id: $cid})
             MERGE (o)-[:ABOUT_CONCEPT]->(c)`,
            { oid: ev.id, cid },
          );
        }
        if (ev.evidenced_by) {
          await this._runAfterInit(
            `MATCH (o:Observation {id: $oid}), (s:Source {id: $sid})
             MERGE (o)-[:EVIDENCED_BY]->(s)`,
            { oid: ev.id, sid: ev.evidenced_by },
          );
        }
        for (const c of ev.cites_manex ?? []) {
          if (!c.entity_id) continue;
          await this._runAfterInit(
            `MATCH (o:Observation {id: $oid}), (e:Entity {id: $eid})
             MERGE (o)-[r:CITES_MANEX]->(e)
             SET r.tbl=$tbl, r.row_id=$row_id`,
            { oid: ev.id, eid: c.entity_id, tbl: c.table, row_id: c.row_id },
          );
        }
        return;
      case "report":
        await this._runAfterInit(
          `MERGE (n:Report {id: $id})
           SET n.report_kind=$k, n.title=$title, n.body=$body,
               n.status=$status, n.author=$author,
               n.created_at=$created, n.closed_at=$closed`,
          {
            id: ev.id,
            k: ev.report_kind,
            title: ev.title,
            body: ev.body,
            status: ev.status,
            author: ev.author,
            created: ev.created_at,
            closed: ev.closed_at ?? "",
          },
        );
        for (const oid of ev.contains_observations ?? []) {
          await this._runAfterInit(
            `MATCH (r:Report {id: $rid}), (o:Observation {id: $oid})
             MERGE (r)-[:CONTAINS]->(o)`,
            { rid: ev.id, oid },
          );
        }
        for (const eid of ev.about_entities ?? []) {
          await this._runAfterInit(
            `MATCH (r:Report {id: $rid}), (e:Entity {id: $eid})
             MERGE (r)-[:REPORT_ABOUT_ENTITY]->(e)`,
            { rid: ev.id, eid },
          );
        }
        for (const cid of ev.about_concepts ?? []) {
          await this._runAfterInit(
            `MATCH (r:Report {id: $rid}), (c:Concept {id: $cid})
             MERGE (r)-[:REPORT_ABOUT_CONCEPT]->(c)`,
            { rid: ev.id, cid },
          );
        }
        return;
      case "link":
        switch (ev.rel) {
          case "CAUSED_BY":
            await this._runAfterInit(
              `MATCH (a:Concept {id: $from}), (b:Concept {id: $to})
               MERGE (a)-[:CAUSED_BY]->(b)`,
              { from: ev.from, to: ev.to },
            );
            return;
          case "SUBTYPE_OF":
            await this._runAfterInit(
              `MATCH (a:Concept {id: $from}), (b:Concept {id: $to})
               MERGE (a)-[:SUBTYPE_OF]->(b)`,
              { from: ev.from, to: ev.to },
            );
            return;
          case "INDICATED_BY":
            await this._runAfterInit(
              `MATCH (a:Concept {id: $from}), (b:Entity {id: $to})
               MERGE (a)-[:INDICATED_BY]->(b)`,
              { from: ev.from, to: ev.to },
            );
            return;
          default:
            // structural entity→entity
            await this._runAfterInit(
              `MATCH (a:Entity {id: $from}), (b:Entity {id: $to})
               MERGE (a)-[r:STRUCTURAL]->(b)
               SET r.rel=$rel`,
              { from: ev.from, to: ev.to, rel: ev.rel },
            );
            return;
        }
      case "log":
        await this._runAfterInit(
          `MERGE (n:LogEntry {id: $id})
           SET n.ts=$ts, n.action=$action, n.summary=$summary`,
          { id: ev.id, ts: ev.ts, action: ev.action, summary: ev.summary },
        );
        return;
    }
  }
}

async function loadKuzu(): Promise<KuzuMod> {
  // Cache the kuzu-wasm module on globalThis so HMR reloads don't re-import
  // it — each fresh import spawns a new tiny-worker and pins more memory in
  // the shared WASM heap. Returning the cached module keeps us to one worker
  // per Node process, which is the actual fix for the MaxListeners /
  // Buffer-exhausted cascade under dev.
  if (global.__kg_mod) return global.__kg_mod;
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const mod = req("kuzu-wasm/nodejs");
  global.__kg_mod = mod;
  return mod;
}

export function kg(): KgClient {
  if (global.__kg_client) return global.__kg_client;
  global.__kg_client = new KgClient();
  return global.__kg_client;
}
