"use client";

import { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Position,
  MarkerType,
  type Node,
  type Edge,
  Handle,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import dagre from "@dagrejs/dagre";
import { kindMeta } from "./kg-icon";
import { cn } from "@/lib/utils";

type GraphNode = {
  id: string;
  label: string;
  kind: string;
  subkind?: string;
};
type GraphEdge = { from: string; to: string; rel: string };

const NODE_W = 220;
const NODE_H = 58;

/**
 * Solid-colour palette used by the MiniMap so every kind has a distinct,
 * high-contrast dot against the parchment background. Matches the icon
 * palette from kindMeta but biased a shade darker for readability at
 * minimap scale.
 */
const KIND_DOT_COLOR: Record<string, string> = {
  Factory: "#57534e",
  Line: "#0369a1",
  Section: "#0d9488",
  Article: "#4f46e5",
  Supplier: "#7c3aed",
  Batch: "#d97706",
  Part: "#0284c7",
  BomPosition: "#0891b2",
  DefectCode: "#be123c",
  TestCode: "#65a30d",
  Operator: "#db2777",
  Order: "#64748b",
  Product: "#52525b",
  Concept: "#b45309",
  Observation: "#64748b",
  Report: "#047857",
  Source: "#525252",
};

function dotColor(kind?: string) {
  return KIND_DOT_COLOR[kind ?? ""] ?? "#9ca3af";
}

/** Top-level node kinds (React Flow layer filter). */
const KINDS = [
  "Entity",
  "Concept",
  "Observation",
  "Report",
  "Source",
] as const;

/**
 * Entity subkinds we offer fine-grained filters for. Default-on covers the
 * structural landmarks; Part and BomPosition are default-off because they
 * explode the graph without adding much structure at 200-node scale.
 */
const ENTITY_SUBKINDS = [
  { key: "Factory", defaultOn: true },
  { key: "Line", defaultOn: true },
  { key: "Section", defaultOn: true },
  { key: "Article", defaultOn: true },
  { key: "Supplier", defaultOn: true },
  { key: "Batch", defaultOn: true },
  { key: "DefectCode", defaultOn: true },
  { key: "TestCode", defaultOn: true },
  { key: "Operator", defaultOn: true },
  { key: "Part", defaultOn: false },
  { key: "BomPosition", defaultOn: false },
  { key: "Order", defaultOn: false },
] as const;

/** Edge colour/style per relationship type. */
const EDGE_STYLE: Record<
  string,
  { stroke: string; width: number; dashed?: boolean; label: boolean }
> = {
  STRUCTURAL: { stroke: "#334155", width: 1.4, label: false },
  SUPPLIED_BY: { stroke: "#7c3aed", width: 1.4, label: true },
  OF_PART: { stroke: "#0ea5e9", width: 1.4, label: true },
  IN_ARTICLE: { stroke: "#6366f1", width: 1.4, label: true },
  USED_AT: { stroke: "#06b6d4", width: 1.4, label: true },
  BELONGS_TO: { stroke: "#334155", width: 1, label: false },
  CAUSED_BY: { stroke: "#dc2626", width: 1.6, label: true },
  SUBTYPE_OF: { stroke: "#9333ea", width: 1.4, label: true },
  INDICATED_BY: { stroke: "#f59e0b", width: 1.4, label: true },
  ABOUT_ENTITY: { stroke: "#94a3b8", width: 0.8, dashed: true, label: false },
  ABOUT_CONCEPT: { stroke: "#94a3b8", width: 0.8, dashed: true, label: false },
  REPORT_ABOUT_ENTITY: {
    stroke: "#10b981",
    width: 1,
    dashed: true,
    label: false,
  },
  REPORT_ABOUT_CONCEPT: {
    stroke: "#10b981",
    width: 1,
    dashed: true,
    label: false,
  },
  EVIDENCED_BY: { stroke: "#a3a3a3", width: 0.7, dashed: true, label: false },
  CITES_MANEX: { stroke: "#a3a3a3", width: 0.7, dashed: true, label: false },
  CONTAINS: { stroke: "#10b981", width: 1.2, label: true },
};

function styleFor(rel: string) {
  return EDGE_STYLE[rel] ?? {
    stroke: "#94a3b8",
    width: 1,
    label: false,
  };
}

function NodeCard({
  data,
}: {
  data: { label: string; kind: string; subkind?: string; focused: boolean };
}) {
  const meta = kindMeta(data.subkind || data.kind);
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "w-[210px] rounded-md border bg-white px-2 py-1.5 text-xs shadow-sm dark:bg-zinc-950",
        data.focused
          ? "border-emerald-400 ring-2 ring-emerald-200"
          : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-400" />
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded ring-1 ring-inset",
            meta.bg,
            meta.ring,
          )}
        >
          <Icon className={cn("h-3 w-3", meta.color)} />
        </span>
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {data.subkind || data.kind}
        </span>
      </div>
      <div className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-tight text-zinc-900 dark:text-zinc-100">
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-zinc-400" />
    </div>
  );
}

const nodeTypes = { kg: NodeCard };

/**
 * Column-by-kind grid layout.
 *
 * Every subkind gets its own vertical lane; nodes within a lane are stacked.
 * Within a lane, dagre is used as a 1-D ordering heuristic (best-effort —
 * falls back to alpha sort) so that neighbours tend to align across lanes and
 * cross-lane edges don't criss-cross as badly. This beats full dagre at
 * hackathon scale because it produces a predictable, scan-able layout the
 * user can navigate by kind.
 */
// Lane order is read left-to-right. Placing Concept *before* DefectCode /
// TestCode means INDICATED_BY edges (Concept -> DefectCode / TestCode) flow
// forward instead of looping back — this removes the visual stubs on the
// right side of DefectCode / TestCode nodes.
const LANE_ORDER = [
  "Factory",
  "Line",
  "Section",
  "Article",
  "BomPosition",
  "Part",
  "Batch",
  "Supplier",
  "Operator",
  "Order",
  "Concept",
  "DefectCode",
  "TestCode",
  "Report",
  "Observation",
  "Source",
];

function laneOf(n: GraphNode): string {
  if (n.kind === "Entity") return n.subkind ?? "Entity";
  return n.kind;
}

function columnLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
  const byLane = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const lane = laneOf(n);
    if (!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane)!.push(n);
  }

  // Use dagre once to get a rank-order hint for Y positions inside lanes.
  const hint = new Map<string, number>();
  try {
    const g = new dagre.graphlib.Graph({ compound: false, multigraph: true });
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: "LR",
      nodesep: 8,
      ranksep: 50,
      marginx: 0,
      marginy: 0,
      ranker: "network-simplex",
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      g.setNode(n.id, { width: NODE_W, height: NODE_H });
    }
    for (const [i, e] of edges.entries()) {
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
      g.setEdge(e.from, e.to, { weight: 1 }, `e${i}`);
    }
    dagre.layout(g);
    for (const n of nodes) {
      const info = g.node(n.id) as { y?: number } | undefined;
      if (info && typeof info.y === "number") hint.set(n.id, info.y);
    }
  } catch {
    /* hint optional */
  }

  const out = new Map<string, { x: number; y: number }>();
  const activeLanes = LANE_ORDER.filter((l) => (byLane.get(l)?.length ?? 0) > 0);
  // Plus any lane that isn't listed in LANE_ORDER but exists — append at end.
  for (const lane of byLane.keys()) {
    if (!activeLanes.includes(lane)) activeLanes.push(lane);
  }
  const LANE_GAP = NODE_W + 80;
  const ROW_GAP = NODE_H + 22;

  activeLanes.forEach((lane, laneIdx) => {
    const list = byLane.get(lane)!;
    list.sort((a, b) => {
      const ha = hint.get(a.id) ?? 0;
      const hb = hint.get(b.id) ?? 0;
      if (ha !== hb) return ha - hb;
      return (a.label ?? a.id).localeCompare(b.label ?? b.id);
    });
    list.forEach((n, i) => {
      out.set(n.id, {
        x: laneIdx * LANE_GAP,
        y: i * ROW_GAP,
      });
    });
  });
  return out;
}

export function GraphClient({
  nodes,
  edges,
  focus,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focus: string | null;
}) {
  const router = useRouter();

  // Default-show: structural Entities (filtered by subkind below) + Concepts
  // + Reports. Hide Observations and Sources by default.
  const [visible, setVisible] = useState<Record<(typeof KINDS)[number], boolean>>({
    Entity: true,
    Concept: true,
    Observation: false,
    Report: true,
    Source: false,
  });
  const [subkindOn, setSubkindOn] = useState<Record<string, boolean>>(() => {
    const s: Record<string, boolean> = {};
    for (const { key, defaultOn } of ENTITY_SUBKINDS) s[key] = defaultOn;
    return s;
  });
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  const [query, setQuery] = useState("");

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter((n) => {
      if (!visible[n.kind as (typeof KINDS)[number]]) return false;
      if (n.kind === "Entity" && n.subkind) {
        if (!(subkindOn[n.subkind] ?? true)) return false;
      }
      if (q) {
        const hay = `${n.label} ${n.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [nodes, visible, subkindOn, query]);

  const filteredEdges = useMemo(() => {
    const ids = new Set(filteredNodes.map((n) => n.id));
    return edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  }, [filteredNodes, edges]);

  const { flowNodes, flowEdges } = useMemo(() => {
    const pos = columnLayout(filteredNodes, filteredEdges);
    const fNodes: Node[] = filteredNodes.map((n) => {
      const p = pos.get(n.id) ?? { x: 0, y: 0 };
      return {
        id: n.id,
        type: "kg",
        position: p,
        // Advertise the node dimensions to React Flow so the MiniMap has
        // rectangles to draw. The main canvas still measures the actual DOM
        // size via ResizeObserver, so this doesn't interfere with edge
        // routing.
        width: NODE_W,
        height: NODE_H,
        data: {
          label: n.label,
          kind: n.kind,
          subkind: n.subkind,
          focused: n.id === focus,
        },
      };
    });
    const fEdges: Edge[] = filteredEdges.map((e, i) => {
      const s = styleFor(e.rel);
      return {
        id: `e${i}-${e.from}-${e.to}-${e.rel}`,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        label: showEdgeLabels || s.label ? e.rel : undefined,
        labelStyle: { fontSize: 9, fill: "#52525b" },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.85 },
        style: {
          stroke: s.stroke,
          strokeWidth: s.width,
          strokeDasharray: s.dashed ? "4 4" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: s.stroke,
          width: 14,
          height: 14,
        },
      };
    });
    return { flowNodes: fNodes, flowEdges: fEdges };
  }, [filteredNodes, filteredEdges, focus, showEdgeLabels]);

  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of nodes) c[n.kind] = (c[n.kind] ?? 0) + 1;
    return c;
  }, [nodes]);
  const subkindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of nodes) {
      if (n.kind === "Entity" && n.subkind) {
        c[n.subkind] = (c[n.subkind] ?? 0) + 1;
      }
    }
    return c;
  }, [nodes]);

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-zinc-200 bg-white/95 px-2 py-1.5 text-xs shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="flex items-center gap-1.5">
          {KINDS.map((k) => {
            const meta = kindMeta(k);
            const Icon = meta.icon;
            const on = visible[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 transition-colors",
                  on
                    ? `${meta.bg} ${meta.color} border-transparent`
                    : "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950",
                )}
                title={on ? `Hide ${k}` : `Show ${k}`}
              >
                <Icon className="h-3 w-3" />
                <span>{k}</span>
                <span className="ml-1 rounded bg-black/5 px-1 text-[10px] dark:bg-white/10">
                  {kindCounts[k] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
        <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex flex-wrap items-center gap-1">
          {ENTITY_SUBKINDS.map(({ key }) => {
            const count = subkindCounts[key] ?? 0;
            if (count === 0) return null;
            const on = (subkindOn[key] ?? true) && visible.Entity;
            const meta = kindMeta(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setSubkindOn((s) => ({ ...s, [key]: !(s[key] ?? true) }))
                }
                disabled={!visible.Entity}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide transition-colors",
                  on
                    ? `${meta.bg} ${meta.color} ring-1 ring-inset ${meta.ring}`
                    : "bg-white text-zinc-400 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800",
                  !visible.Entity && "opacity-40",
                )}
              >
                {key} {count}
              </button>
            );
          })}
        </div>
        <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter by id or label…"
          className="h-6 min-w-[180px] rounded border border-zinc-200 bg-white px-2 text-[11px] outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        />
        <button
          type="button"
          onClick={() => setShowEdgeLabels((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5",
            showEdgeLabels
              ? "border-transparent bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
              : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300",
          )}
          title="Show edge labels"
        >
          edge labels
        </button>
        <span className="ml-auto text-[10px] text-zinc-500">
          {filteredNodes.length} nodes · {filteredEdges.length} edges
        </span>
      </div>

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2.5}
        onNodeClick={(_, node) => {
          router.push(`/wiki/n/${encodeURIComponent(node.id)}`);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="#d7d8d0" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeStrokeWidth={1}
          nodeStrokeColor="#ffffff"
          nodeBorderRadius={3}
          maskColor="rgba(35, 37, 29, 0.09)"
          maskStrokeColor="#4d4f46"
          maskStrokeWidth={1.2}
          nodeColor={(n) => {
            const d = n.data as
              | { kind?: string; subkind?: string }
              | undefined;
            return dotColor(d?.subkind || d?.kind);
          }}
          style={{
            width: 230,
            height: 170,
            margin: 12,
            backgroundColor: "#fdfdf8",
            border: "1px solid #bfc1b7",
            borderRadius: 6,
            boxShadow: "0 10px 24px -14px rgba(35, 37, 29, 0.35)",
          }}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
