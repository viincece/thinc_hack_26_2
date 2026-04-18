import type Anthropic from "@anthropic-ai/sdk";
import { safeSelect, SqlGuardError } from "@/lib/db";
import { manex, type DefectDetail } from "@/lib/manex";
import { KG_TOOLS, runKgTool } from "@/lib/kg/tools";
import {
  FIELD_PATHS,
  isFieldPath,
  type FieldStatus,
} from "@/components/copilot/eight-d-doc";

const FIELD_PATHS_LIST = FIELD_PATHS.map((p) => `  - ${p}`).join("\n");

/* -------------------------------------------------------------- *
 *  Tool schemas (sent to Claude)
 * -------------------------------------------------------------- */

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "sql_query",
    description:
      "Run a read-only SELECT (or WITH … SELECT) against the Manex Postgres. " +
      "Multiple statements, DDL and DML are rejected. A hard LIMIT is " +
      "enforced server-side. Prefer the convenience views: v_defect_detail, " +
      "v_product_bom_parts, v_field_claim_detail, v_quality_summary. " +
      "Use information_schema to discover columns if you are unsure. " +
      "Returns up to 500 rows.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "A single SELECT / WITH statement." },
        purpose: {
          type: "string",
          description:
            "One sentence: why you are running this query. Shown to the engineer.",
        },
      },
      required: ["sql", "purpose"],
    },
  },
  {
    name: "run_analysis",
    description:
      "Execute a pre-built analysis. Prefer this over raw SQL when the kind " +
      "matches your need — output is already shaped for the UI.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "pareto_defects",
            "defect_timeline",
            "operator_order_hotspot",
            "section_week_heatmap",
            "field_claim_lag",
            "similar_incidents",
            "describe_table",
          ],
          description:
            "pareto_defects: defect-code Pareto (+cost). " +
            "defect_timeline: per-week defect counts, optionally filtered. " +
            "operator_order_hotspot: Story-4 shape — defects per (order_id, rework.user_id). " +
            "section_week_heatmap: counts by (occurrence_section, iso-week). " +
            "field_claim_lag: days_from_build distribution per article. " +
            "similar_incidents: past defects with the same defect_code and/or article_id. " +
            "describe_table: columns of a table or view (information_schema).",
        },
        filters: {
          type: "object",
          description:
            "Optional filters. Supported keys vary by kind: since (ISO date), " +
            "article_id, defect_code, section_id, severity, table (for describe_table).",
          additionalProperties: true,
        },
      },
      required: ["kind"],
    },
  },
  {
    name: "propose_initiative",
    description:
      "Draft a corrective-action initiative for the user to confirm. This " +
      "does NOT write to the database — the UI shows the engineer a card " +
      "with Confirm / Edit / Dismiss. Use in D5 of an 8D.",
    input_schema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description:
            "Product the initiative is anchored to. If the root cause is a " +
            "supplier batch or article-wide design issue, still pick a " +
            "representative product_id from the evidence.",
        },
        defect_id: {
          type: "string",
          description: "Optional: link to a specific defect.",
        },
        action_type: {
          type: "string",
          enum: ["containment", "corrective", "preventive", "investigation"],
        },
        owner_user_id: {
          type: "string",
          description:
            "Suggested owner. Should come from evidence — e.g. the section " +
            "supervisor, the rework user on the most similar past defect, " +
            "or a named engineer. If unknown, use 'unassigned'.",
        },
        title: {
          type: "string",
          description: "Short imperative title, < 80 chars.",
        },
        details: {
          type: "string",
          description:
            "Markdown. Scope, acceptance criteria, referenced row IDs.",
        },
        due_date: {
          type: "string",
          description: "ISO date (YYYY-MM-DD). Optional.",
        },
      },
      required: ["product_id", "action_type", "owner_user_id", "title", "details"],
    },
  },
  ...KG_TOOLS,
  {
    name: "update_report_field",
    description:
      "Write a single structured field of the 8D editor. The editor renders " +
      "forms, not free-text — you must patch by field path. Always prefer " +
      "making the call (even with status='needs_input' + a short note) over " +
      "skipping a field: the user needs to see the agent's work.\n\n" +
      "Grounding contract:\n" +
      "- 'filled'    — direct fact from the wiki/Manex; include a `source` (row IDs).\n" +
      "- 'suggested' — informed inference; include closest evidence as `source`.\n" +
      "- 'needs_input' — data can't answer it (signatures, external contacts, future dates, " +
      "human judgement). Leave `value` null; write a short `note` saying what to gather.\n\n" +
      "Soft-fail: if you forget `source` the patch is still applied but downgraded to " +
      "'suggested' with a warning. NEVER invent IDs, names, numbers, or dates — when " +
      "in doubt use 'needs_input'.\n\n" +
      "Allowed paths:\n" +
      FIELD_PATHS_LIST +
      "\n\n" +
      "Value shapes:\n" +
      "- complaintDate, reportDate, firstOkDate, *.dueDate, *.endDate, *.date → ISO date string 'YYYY-MM-DD'.\n" +
      "- customer.*, supplier.* fields (complaintNo, articleNr, articleName, drawingIndex, contactPerson, email, phone) → string.\n" +
      "- problem, firstOkPo, otherPartsWhich, appreciation → string.\n" +
      "- champion, coordinator → object {name, department, contact}.\n" +
      "- team → array of {name, department, contact}.\n" +
      "- failureImages → array of {name, dataUrl?}.\n" +
      "- suspect.* → {qty, conducted: boolean, reference}.\n" +
      "- immediate.* → {enabled: boolean, responsible, dueDate, description, effectiveness: number}.\n" +
      "- occurrence, detection → {categories: SixM[], potentialCause, whys: string[5], rootCauses: [{text, participation: number}]}.\n" +
      "  SixM ∈ {Man, Machine, Material, Method, Environment, Measurement}.\n" +
      "- plannedOccurrence, plannedDetection → array of {rootCauseNo, description, responsible, date}.\n" +
      "- implementedOccurrence, implementedDetection → array of {rootCauseNo, description, date, effectiveness: number, note}.\n" +
      "- preventive.* → {applicable: 'yes'|'no', responsible, dueDate, endDate}.\n" +
      "- riskOfNewFailure, transferredToSimilar, otherPartsAffected → 'yes' | 'no' | ''.\n",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Exactly one of the whitelisted paths.",
        },
        value: {
          description:
            "The field value, shaped per the allowed-paths table. Omit or null for status='needs_input'.",
        },
        status: {
          type: "string",
          enum: ["filled", "suggested", "needs_input"],
          description:
            "filled = fact from data. suggested = informed guess, needs human verification. needs_input = data cannot answer this field.",
        },
        source: {
          type: "string",
          description:
            "Comma-separated row IDs / Observation IDs (DEF-…, OBS-…, ART-…, SB-…, PM-…, etc.) that justify the value. REQUIRED when status is 'filled' or 'suggested'.",
        },
        note: {
          type: "string",
          description:
            "Short explanation. REQUIRED when status='needs_input' — tell the engineer what they need to gather.",
        },
        purpose: {
          type: "string",
          description: "One sentence summary for the chat pane.",
        },
      },
      required: ["path", "status"],
    },
  },
];

/* -------------------------------------------------------------- *
 *  Tool executors
 * -------------------------------------------------------------- */

export type ToolInput = Record<string, unknown>;
export type ToolResult =
  | { ok: true; data: unknown; ui_event?: UiEvent }
  | { ok: false; error: string };

export type UiEvent =
  | { type: "propose_initiative"; payload: InitiativeDraft }
  | {
      type: "update_report_field";
      path: string;
      value: unknown;
      status: FieldStatus;
      source?: string;
      note?: string;
    };

export type InitiativeDraft = {
  product_id: string;
  defect_id?: string;
  action_type: "containment" | "corrective" | "preventive" | "investigation";
  owner_user_id: string;
  title: string;
  details: string;
  due_date?: string;
};

export async function runTool(
  name: string,
  input: ToolInput,
): Promise<ToolResult> {
  try {
    if (name.startsWith("kg_")) {
      const r = await runKgTool(name, input);
      return r.ok
        ? { ok: true, data: r.data }
        : { ok: false, error: r.error };
    }
    switch (name) {
      case "sql_query":
        return await toolSqlQuery(input);
      case "run_analysis":
        return await toolRunAnalysis(input);
      case "propose_initiative":
        return toolProposeInitiative(input);
      case "update_report_field":
        return toolUpdateReportField(input);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

async function toolSqlQuery(input: ToolInput): Promise<ToolResult> {
  const sql = String(input.sql ?? "");
  if (!sql) return { ok: false, error: "Missing sql" };
  try {
    const r = await safeSelect(sql);
    return {
      ok: true,
      data: { rowCount: r.rowCount, truncated: r.truncated, rows: r.rows },
    };
  } catch (e) {
    if (e instanceof SqlGuardError) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : String(e);

    // Auto-describe: if Postgres rejected an unknown column or relation,
    // fetch the real column list for the referenced table and return it in
    // the error so the agent can self-correct in the very next turn.
    const hint = await autoDescribeHint(sql, msg).catch(() => null);
    return {
      ok: false,
      error: hint ? `${msg}\n\n${hint}` : msg,
    };
  }
}

async function autoDescribeHint(sql: string, errMsg: string): Promise<string | null> {
  // Recognize the two common "you invented a column / table" errors.
  const colMatch = errMsg.match(/column "?([\w.]+)"? does not exist/i);
  const relMatch = errMsg.match(/relation "?([\w.]+)"? does not exist/i);

  const target = colMatch?.[1] ?? relMatch?.[1] ?? null;

  // Pick the table name to describe: prefer the table mentioned in FROM/JOIN,
  // falling back to the missing relation name.
  const fromMatch = sql.match(/\bfrom\s+([a-z_][\w.]*)/i);
  const tables = new Set<string>();
  if (fromMatch?.[1]) tables.add(fromMatch[1].split(".").pop()!.toLowerCase());
  for (const m of sql.matchAll(/\bjoin\s+([a-z_][\w.]*)/gi)) {
    if (m[1]) tables.add(m[1].split(".").pop()!.toLowerCase());
  }
  if (relMatch?.[1]) tables.add(relMatch[1].toLowerCase());
  if (colMatch?.[1]?.includes(".")) {
    const [tbl] = colMatch[1].split(".");
    if (tbl) tables.add(tbl.toLowerCase());
  }

  if (tables.size === 0) return target ? `Check that '${target}' exists.` : null;

  const lines: string[] = [
    "SELF-CORRECT: the columns actually available on the tables you referenced are:",
  ];
  for (const t of tables) {
    try {
      const { rows } = await safeSelect(
        `SELECT column_name FROM information_schema.columns
           WHERE table_schema='public' AND table_name='${t.replace(/[^a-z0-9_]/gi, "")}'
           ORDER BY ordinal_position`,
      );
      const cols = (rows as Array<{ column_name: string }>)
        .map((r) => r.column_name)
        .join(", ");
      lines.push(`- ${t}: ${cols || "(no such table)"}`);
    } catch {
      lines.push(`- ${t}: (unable to introspect)`);
    }
  }
  lines.push(
    "Rewrite your SQL using ONLY these column names. Do not invent columns.",
  );
  return lines.join("\n");
}

async function toolRunAnalysis(input: ToolInput): Promise<ToolResult> {
  const kind = String(input.kind ?? "");
  const filters = (input.filters ?? {}) as Record<string, string>;
  try {
    switch (kind) {
      case "pareto_defects":
        return { ok: true, data: await analysisParetoDefects(filters) };
      case "defect_timeline":
        return { ok: true, data: await analysisDefectTimeline(filters) };
      case "operator_order_hotspot":
        return { ok: true, data: await analysisOperatorOrderHotspot(filters) };
      case "section_week_heatmap":
        return { ok: true, data: await analysisSectionWeekHeatmap(filters) };
      case "field_claim_lag":
        return { ok: true, data: await analysisFieldClaimLag(filters) };
      case "similar_incidents":
        return { ok: true, data: await analysisSimilarIncidents(filters) };
      case "describe_table":
        return { ok: true, data: await analysisDescribeTable(filters) };
      default:
        return { ok: false, error: `Unknown analysis kind: ${kind}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

function toolProposeInitiative(input: ToolInput): ToolResult {
  const draft = input as unknown as InitiativeDraft;
  if (!draft.product_id || !draft.title || !draft.action_type) {
    return { ok: false, error: "Missing required fields" };
  }
  return {
    ok: true,
    data: { status: "awaiting_confirmation", draft },
    ui_event: { type: "propose_initiative", payload: draft },
  };
}

function toolUpdateReportField(input: ToolInput): ToolResult {
  const path = String(input.path ?? "");
  if (!path) return { ok: false, error: "Missing path" };
  if (!isFieldPath(path)) {
    return {
      ok: false,
      error:
        `Unknown field path: ${path}. Must be exactly one of the whitelisted paths in the tool description.`,
    };
  }
  const rawStatus = String(input.status ?? "") as FieldStatus;
  if (!["filled", "suggested", "needs_input"].includes(rawStatus)) {
    return {
      ok: false,
      error: "status must be 'filled', 'suggested', or 'needs_input'",
    };
  }

  const source =
    typeof input.source === "string" && input.source.trim()
      ? input.source.trim()
      : undefined;
  const rawNote =
    typeof input.note === "string" && input.note.trim()
      ? input.note.trim()
      : undefined;

  let status: FieldStatus = rawStatus;
  let value = input.value;
  let note = rawNote;
  let source_out = source;
  const warnings: string[] = [];

  // Soft-fail grounding guardrails: every call still produces a visible UI
  // patch so the user sees the agent's work, but we downgrade status when
  // the agent didn't supply the evidence the rules require.
  if (status === "filled" || status === "suggested") {
    const hasValue =
      value !== undefined &&
      value !== null &&
      !(typeof value === "string" && value.trim() === "");

    if (!hasValue) {
      warnings.push("value was empty — downgraded to needs_input");
      status = "needs_input";
      if (!note) note = "Agent did not supply a value for this field.";
      value = null;
      source_out = source_out ?? undefined;
    } else if (!source_out) {
      warnings.push(
        "no `source` supplied — downgraded to suggested (review needed)",
      );
      status = "suggested";
      source_out = "unverified: no row IDs cited";
    }
  } else {
    // needs_input
    if (!note) note = "Engineer must fill this field.";
    value = null;
  }

  return {
    ok: true,
    data: {
      ok: true,
      path,
      applied_status: status,
      requested_status: rawStatus,
      warnings,
    },
    ui_event: {
      type: "update_report_field",
      path,
      value,
      status,
      source: source_out,
      note,
    },
  };
}

/* -------------------------------------------------------------- *
 *  Canned analyses
 *
 *  These run against the live DB. The column names used here come from
 *  docs/SCHEMA.md. If a query fails, the error is returned to the agent
 *  verbatim so it can fall back to `sql_query` after describing the table.
 * -------------------------------------------------------------- */

async function analysisParetoDefects(filters: Record<string, string>) {
  const query: Record<string, string> = {
    select: "defect_code,cost,defect_ts",
    order: "defect_ts.desc",
    limit: "5000",
  };
  if (filters.since) query.defect_ts = `gte.${filters.since}`;
  if (filters.article_id) query.article_id = `eq.${filters.article_id}`;
  const rows = await manex<DefectDetail[]>("/v_defect_detail", query);
  const map = new Map<string, { code: string; count: number; cost: number }>();
  for (const r of rows) {
    const code = r.defect_code ?? "UNKNOWN";
    const b = map.get(code) ?? { code, count: 0, cost: 0 };
    b.count += 1;
    b.cost += Number(r.cost ?? 0);
    map.set(code, b);
  }
  const sorted = [...map.values()].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, b) => s + b.count, 0);
  let running = 0;
  return {
    total,
    buckets: sorted.map((b) => {
      running += b.count;
      return {
        ...b,
        share: total ? b.count / total : 0,
        cumShare: total ? running / total : 0,
      };
    }),
  };
}

async function analysisDefectTimeline(filters: Record<string, string>) {
  const where: string[] = ["1=1"];
  if (filters.defect_code)
    where.push(`defect_code = '${safeLit(filters.defect_code)}'`);
  if (filters.since) where.push(`ts >= '${safeLit(filters.since)}'::timestamptz`);
  if (filters.article_id) {
    // article_id lives on product, not defect — join required
    where.push(
      `product_id IN (SELECT product_id FROM product WHERE article_id = '${safeLit(
        filters.article_id,
      )}')`,
    );
  }
  const { rows } = await safeSelect(`
    SELECT date_trunc('week', ts)::date AS week,
           defect_code,
           COUNT(*)::int AS n
      FROM defect
     WHERE ${where.join(" AND ")}
     GROUP BY 1, 2
     ORDER BY 1
     LIMIT 500
  `);
  return { rows };
}

async function analysisOperatorOrderHotspot(filters: Record<string, string>) {
  const where = ["rw.user_id IS NOT NULL"];
  if (filters.severity)
    where.push(`d.severity = '${safeLit(filters.severity)}'`);
  if (filters.since) where.push(`d.ts >= '${safeLit(filters.since)}'::timestamptz`);
  const { rows } = await safeSelect(`
    SELECT p.order_id,
           rw.user_id,
           COUNT(DISTINCT d.defect_id)::int AS defects,
           ARRAY_AGG(DISTINCT d.defect_code) AS codes
      FROM defect d
      JOIN product p  ON p.product_id = d.product_id
      JOIN rework rw  ON rw.defect_id = d.defect_id
     WHERE ${where.join(" AND ")}
     GROUP BY p.order_id, rw.user_id
     ORDER BY defects DESC
     LIMIT 25
  `);
  return { rows };
}

async function analysisSectionWeekHeatmap(filters: Record<string, string>) {
  const where = ["d.occurrence_section_id IS NOT NULL"];
  if (filters.defect_code)
    where.push(`d.defect_code = '${safeLit(filters.defect_code)}'`);
  if (filters.since)
    where.push(`d.ts >= '${safeLit(filters.since)}'::timestamptz`);
  const { rows } = await safeSelect(`
    SELECT s.name AS section,
           to_char(date_trunc('week', d.ts), 'IYYY-"W"IW') AS iso_week,
           COUNT(*)::int AS n
      FROM defect d
      JOIN section s ON s.section_id = d.occurrence_section_id
     WHERE ${where.join(" AND ")}
     GROUP BY 1, 2
     ORDER BY 2, 1
     LIMIT 500
  `);
  return { rows };
}

async function analysisFieldClaimLag(filters: Record<string, string>) {
  const where = ["p.build_ts IS NOT NULL"];
  if (filters.article_id)
    where.push(`p.article_id = '${safeLit(filters.article_id)}'`);
  const { rows } = await safeSelect(`
    SELECT p.article_id,
           EXTRACT(day FROM (fc.claim_ts - p.build_ts))::int AS days_from_build,
           COUNT(*)::int AS n
      FROM field_claim fc
      JOIN product p ON p.product_id = fc.product_id
     WHERE ${where.join(" AND ")}
     GROUP BY 1, 2
     ORDER BY 1, 2
     LIMIT 500
  `);
  return { rows };
}

async function analysisSimilarIncidents(filters: Record<string, string>) {
  const where: string[] = [];
  if (filters.defect_code)
    where.push(`d.defect_code = '${safeLit(filters.defect_code)}'`);
  if (filters.article_id)
    where.push(`p.article_id = '${safeLit(filters.article_id)}'`);
  if (!where.length) {
    return { rows: [], note: "Provide defect_code and/or article_id." };
  }
  const { rows } = await safeSelect(`
    SELECT d.defect_id, d.ts::date AS ts, d.defect_code, d.severity,
           p.article_id, d.reported_part_number, d.notes
      FROM defect d
      JOIN product p ON p.product_id = d.product_id
     WHERE ${where.join(" AND ")}
     ORDER BY d.ts DESC
     LIMIT 25
  `);
  return { rows };
}

async function analysisDescribeTable(filters: Record<string, string>) {
  const table = filters.table;
  if (!table) return { rows: [], note: "Pass filters.table = '<name>'" };
  const { rows } = await safeSelect(`
    SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = '${safeLit(table)}'
     ORDER BY ordinal_position
  `);
  return { rows };
}

function safeLit(s: string): string {
  return s.replace(/'/g, "''").replace(/[;\\]/g, "");
}
