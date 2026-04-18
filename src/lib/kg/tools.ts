import type Anthropic from "@anthropic-ai/sdk";
import {
  anchor,
  getNode,
  hybridSearch,
  neighborhood,
  observationsAbout,
  reportsAbout,
  similarReports,
} from "./query";

export const KG_TOOLS: Anthropic.Tool[] = [
  {
    name: "kg_search",
    description:
      "Hybrid search (semantic + keyword) across the knowledge graph. " +
      "Returns top matching nodes across Entities, Concepts, Observations, " +
      "Reports, and Sources. Use this to discover what the wiki already " +
      "knows before running raw SQL.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        k: { type: "integer", default: 10 },
      },
      required: ["query"],
    },
  },
  {
    name: "kg_anchor",
    description:
      "Resolve a handle (entity_id, manex_id, article_id, or defect_code) " +
      "to Entity nodes in the graph. Use this at the start of an 8D / FMEA " +
      "draft to get an entry point.",
    input_schema: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        manex_id: { type: "string" },
        article_id: { type: "string" },
        defect_code: { type: "string" },
      },
    },
  },
  {
    name: "kg_get",
    description:
      "Fetch one node by id with its body/markdown. Useful after kg_search " +
      "to read the full summary of a relevant Entity or Concept.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "kg_neighborhood",
    description:
      "Return nodes within `depth` hops of the given node. Also returns " +
      "every Observation that references any neighbor, and past Reports " +
      "about anything in the neighborhood. This is the bread-and-butter " +
      "query for drafting: one call gives you structural context + " +
      "historical facts + prior reports.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        depth: { type: "integer", default: 2 },
        observations_limit: { type: "integer", default: 25 },
        reports_limit: { type: "integer", default: 5 },
      },
      required: ["id"],
    },
  },
  {
    name: "kg_similar_reports",
    description:
      "Find past 8D / FMEA reports whose body is semantically closest to " +
      "the given text. Use this to reuse language and structure from " +
      "prior investigations.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        k: { type: "integer", default: 5 },
      },
      required: ["text"],
    },
  },
];

export type KgToolInput = Record<string, unknown>;
export type KgToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export async function runKgTool(
  name: string,
  input: KgToolInput,
): Promise<KgToolResult> {
  try {
    switch (name) {
      case "kg_search": {
        const q = String(input.query ?? "");
        const k = Number(input.k ?? 10);
        if (!q) return { ok: false, error: "query required" };
        const rows = await hybridSearch(q, k);
        return { ok: true, data: { hits: rows } };
      }
      case "kg_anchor": {
        const rows = await anchor({
          entity_id: input.entity_id as string | undefined,
          manex_id: input.manex_id as string | undefined,
          article_id: input.article_id as string | undefined,
          defect_code: input.defect_code as string | undefined,
        });
        return { ok: true, data: { entities: rows } };
      }
      case "kg_get": {
        const id = String(input.id ?? "");
        if (!id) return { ok: false, error: "id required" };
        const node = await getNode(id);
        return { ok: true, data: { node } };
      }
      case "kg_neighborhood": {
        const id = String(input.id ?? "");
        if (!id) return { ok: false, error: "id required" };
        const depth = Number(input.depth ?? 2);
        const obsLimit = Number(input.observations_limit ?? 25);
        const repLimit = Number(input.reports_limit ?? 5);
        const nbrs = await neighborhood(id, depth);
        const ids = [id, ...nbrs.map((n) => n.id).filter(Boolean)];
        const [observations, reports] = await Promise.all([
          observationsAbout(ids, obsLimit),
          reportsAbout(ids, repLimit),
        ]);
        return {
          ok: true,
          data: {
            anchor: id,
            neighbors: nbrs,
            observations,
            reports,
          },
        };
      }
      case "kg_similar_reports": {
        const text = String(input.text ?? "");
        const k = Number(input.k ?? 5);
        if (!text) return { ok: false, error: "text required" };
        const rows = await similarReports(text, k);
        return { ok: true, data: { reports: rows } };
      }
      default:
        return { ok: false, error: `Unknown kg tool: ${name}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
