"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import type { FaultNode } from "@/lib/reports/types";

/**
 * Classic top-down fault tree:
 *
 *      [ root event ]
 *              |
 *          ( OR gate )
 *         /    |    \
 *    [cat]   [cat]  [cat]
 *     ...
 *        ( OR )          <- per non-leaf parent
 *       /     \
 *   (leaf)  (leaf)
 *
 * - Root + intermediate events render as rounded rectangles.
 * - Evidence leaves render as circles.
 * - Between each parent and its children we insert an OR-gate node so the
 *   tree reads the same way an IEC 60300-3 fault tree does.
 */

const NODE_TYPES = {
  event: EventCard,
  leaf: LeafCard,
  gate: GateCard,
} as const;

type FlowNode = Node<{
  label: string;
  detail?: string;
  kind: FaultNode["kind"];
  confidence?: FaultNode["confidence"];
}>;

const EVENT_W = 200;
const EVENT_H = 74;
const LEAF_W = 150;
const LEAF_H = 80;
const GATE_W = 48;
const GATE_H = 40;

export function FaultTreeGraph({ root }: { root: FaultNode }) {
  const { nodes, edges } = useMemo(() => buildFlow(root), [root]);

  return (
    <div className="h-[520px] w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.25}
        maxZoom={1.8}
        nodesConnectable={false}
        nodesDraggable={false}
        panOnDrag
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="#d7d8d0" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

/* -------------------------------------------------------------- *
 *  Build nodes + edges, then lay out with dagre (TB).
 * -------------------------------------------------------------- */

function buildFlow(root: FaultNode): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];
  let gateSeq = 0;

  function visit(node: FaultNode, parentId: string | null) {
    const isLeaf = node.kind === "evidence" || !(node.children ?? []).length;
    const type = isLeaf ? "leaf" : "event";
    const flowId = node.id;
    nodes.push({
      id: flowId,
      type,
      data: {
        label: node.label,
        detail: node.detail,
        kind: node.kind,
        confidence: node.confidence,
      },
      position: { x: 0, y: 0 }, // placeholder; dagre fills in
      draggable: false,
      selectable: false,
    });

    if (parentId) {
      edges.push({
        id: `e_${parentId}__${flowId}`,
        source: parentId,
        target: flowId,
        type: "smoothstep",
        style: { stroke: "#9ca3af", strokeWidth: 1.25 },
      });
    }

    if (!isLeaf && (node.children ?? []).length > 0) {
      const gateId = `__gate_${flowId}_${gateSeq++}`;
      nodes.push({
        id: gateId,
        type: "gate",
        data: { label: "OR", kind: "category" },
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
      });
      edges.push({
        id: `e_${flowId}__${gateId}`,
        source: flowId,
        target: gateId,
        type: "smoothstep",
        style: { stroke: "#9ca3af", strokeWidth: 1.25 },
      });
      for (const child of node.children ?? []) {
        visit(child, gateId);
      }
    }
  }
  visit(root, null);

  // Dagre layout (top → bottom).
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 24,
    ranksep: 50,
    ranker: "tight-tree",
    marginx: 24,
    marginy: 24,
  });

  for (const n of nodes) {
    const size =
      n.type === "leaf"
        ? { width: LEAF_W, height: LEAF_H }
        : n.type === "gate"
          ? { width: GATE_W, height: GATE_H }
          : { width: EVENT_W, height: EVENT_H };
    g.setNode(n.id, size);
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  const laidOut = nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    } as FlowNode;
  });

  return { nodes: laidOut, edges };
}

/* -------------------------------------------------------------- *
 *  Custom nodes.
 * -------------------------------------------------------------- */

const KIND_STYLE: Record<FaultNode["kind"], string> = {
  defect:
    "border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/60 dark:text-red-100",
  category:
    "border-violet-400 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-100",
  concept:
    "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100",
  evidence:
    "border-zinc-300 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200",
};

const CONFIDENCE_PILL: Record<string, string> = {
  high: "bg-emerald-600",
  medium: "bg-amber-500",
  low: "bg-zinc-400",
};

function EventCard({ data }: { data: FlowNode["data"] }) {
  return (
    <div
      className={`flex h-full w-full select-none flex-col justify-center rounded-md border-2 px-2 py-1 text-[11px] leading-tight shadow-sm ${
        KIND_STYLE[data.kind]
      }`}
      style={{ width: EVENT_W, height: EVENT_H }}
    >
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">
          {data.kind}
        </span>
        {data.confidence ? (
          <span
            className={`rounded-full px-1.5 text-[8px] font-semibold uppercase text-white ${
              CONFIDENCE_PILL[data.confidence] ?? CONFIDENCE_PILL.low
            }`}
          >
            {data.confidence}
          </span>
        ) : null}
      </div>
      <div className="line-clamp-2 font-semibold">{data.label}</div>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

function LeafCard({ data }: { data: FlowNode["data"] }) {
  return (
    <div
      className={`flex h-full w-full select-none items-center justify-center rounded-full border-2 px-3 text-center text-[11px] leading-tight shadow-sm ${
        KIND_STYLE.evidence
      }`}
      style={{ width: LEAF_W, height: LEAF_H }}
    >
      <div className="line-clamp-3">{data.label}</div>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

function GateCard() {
  // Classic OR-gate shield. Drawn as SVG so it scales crisply.
  return (
    <div
      className="relative flex select-none items-center justify-center"
      style={{ width: GATE_W, height: GATE_H }}
    >
      <svg
        viewBox="0 0 48 40"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d="M4,34 Q24,44 44,34 L44,22 Q24,2 4,22 Z"
          className="fill-zinc-100 stroke-zinc-400 dark:fill-zinc-800 dark:stroke-zinc-600"
          strokeWidth={1.5}
        />
        <text
          x="24"
          y="28"
          textAnchor="middle"
          className="fill-zinc-600 text-[10px] font-semibold dark:fill-zinc-200"
        >
          OR
        </text>
      </svg>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}
