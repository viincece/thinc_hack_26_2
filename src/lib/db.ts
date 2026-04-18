import { Pool } from "pg";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __manexPgPool: Pool | undefined;
}

export function pool(): Pool {
  if (global.__manexPgPool) return global.__manexPgPool;
  const url = env.manexPgUrl();
  if (!url) {
    throw new Error(
      "MANEX_PG_URL is not set. Direct SQL requires a Postgres DSN.",
    );
  }
  const p = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  global.__manexPgPool = p;
  return p;
}

const FORBIDDEN = [
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\balter\b/i,
  /\btruncate\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bcreate\b/i,
  /\bcomment\b/i,
  /\bcopy\b/i,
  /\bvacuum\b/i,
  /\breindex\b/i,
  /\brefresh\b/i,
];

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

export class SqlGuardError extends Error {}

/**
 * Run a read-only SELECT (or WITH ... SELECT) with a hard statement timeout.
 * The agent uses this; writes go through dedicated endpoints.
 */
export async function safeSelect(
  sql: string,
  { timeoutMs = 8000, hardLimit = 500 }: { timeoutMs?: number; hardLimit?: number } = {},
): Promise<{ rows: Record<string, unknown>[]; rowCount: number; truncated: boolean }> {
  const cleaned = stripComments(sql).trim().replace(/;\s*$/, "");
  if (!cleaned) throw new SqlGuardError("Empty SQL");
  if (cleaned.includes(";")) {
    throw new SqlGuardError("Multiple statements are not allowed");
  }
  const head = cleaned.toLowerCase().trimStart();
  if (!(head.startsWith("select") || head.startsWith("with"))) {
    throw new SqlGuardError("Only SELECT / WITH queries are allowed");
  }
  for (const rx of FORBIDDEN) {
    if (rx.test(cleaned)) {
      throw new SqlGuardError(
        `Query contains forbidden keyword: ${rx.source.replace(/\\b/g, "")}`,
      );
    }
  }

  const wrapped = `SELECT * FROM ( ${cleaned} ) __agent LIMIT ${hardLimit + 1}`;

  const client = await pool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${Number(timeoutMs)}`);
    try {
      const res = await client.query(wrapped);
      await client.query("COMMIT");
      const rows = res.rows as Record<string, unknown>[];
      const truncated = rows.length > hardLimit;
      return {
        rows: truncated ? rows.slice(0, hardLimit) : rows,
        rowCount: truncated ? hardLimit : rows.length,
        truncated,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }
  } finally {
    client.release();
  }
}
