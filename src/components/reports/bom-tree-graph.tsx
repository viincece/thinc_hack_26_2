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
import type { BomTreeNode } from "@/lib/reports/types";

type FlowNode = Node<{
  label: string;
  part_number?: string;
  supplier_name?: string;
  supplier_batch_id?: string;
  defects_count?: number;
  highlight?: BomTreeNode["highlight"];
  depth: number;
}>;

const NODE_TYPES = { bom: BomCard } as const;
const NODE_W = 200;
const NODE_H = 76;

export function BomTreeGraph({ root }: { root: BomTreeNode }) {
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

function buildFlow(root: BomTreeNode): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];

  function visit(node: BomTreeNode, parentId: string | null, depth: number) {
    nodes.push({
      id: node.id,
      type: "bom",
      data: {
        label: node.label,
        part_number: node.part_number,
        supplier_name: node.supplier_name,
        supplier_batch_id: node.supplier_batch_id,
        defects_count: node.defects_count,
        highlight: node.highlight,
        depth,
      },
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
    });
    if (parentId) {
      edges.push({
        id: `e_${parentId}__${node.id}`,
        source: parentId,
        target: node.id,
        type: "smoothstep",
        style: { stroke: "#9ca3af", strokeWidth: 1.25 },
      });
    }
    for (const c of node.children ?? []) visit(c, node.id, depth + 1);
  }
  visit(root, null, 0);

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 22,
    ranksep: 48,
    ranker: "tight-tree",
    marginx: 24,
    marginy: 24,
  });
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const laid = nodes.map((n) => {
    const p = g.node(n.id);
    return {
      ...n,
      position: { x: p.x - p.width / 2, y: p.y - p.height / 2 },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    } as FlowNode;
  });
  return { nodes: laid, edges };
}

function BomCard({ data }: { data: FlowNode["data"] }) {
  const hl = data.highlight;
  const style =
    hl === "root_cause"
      ? "border-red-500 bg-red-50 text-red-900 dark:border-red-600 dark:bg-red-950/50 dark:text-red-100"
      : hl === "watch"
        ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
        : data.depth === 0
          ? "border-zinc-400 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div
      className={`flex h-full w-full select-none flex-col justify-center rounded-md border-2 px-2 py-1 text-[11px] leading-tight shadow-sm ${style}`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide opacity-70">
          {data.depth === 0 ? "article" : data.depth === 1 ? "assembly" : "part"}
        </span>
        {hl === "root_cause" ? (
          <span className="rounded-full bg-red-600 px-1.5 text-[9px] font-semibold uppercase text-white">
            suspect
          </span>
        ) : hl === "watch" ? (
          <span className="rounded-full bg-amber-500 px-1.5 text-[9px] font-semibold uppercase text-white">
            watch
          </span>
        ) : null}
        {typeof data.defects_count === "number" && data.defects_count > 0 ? (
          <span className="rounded-full bg-zinc-900 px-1.5 text-[9px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
            {data.defects_count}
          </span>
        ) : null}
      </div>
      <div className="truncate font-semibold">{data.label}</div>
      {data.supplier_name || data.supplier_batch_id ? (
        <div className="truncate text-[10px] opacity-70">
          {data.supplier_name ?? "—"}
          {data.supplier_batch_id ? ` · ${data.supplier_batch_id}` : ""}
        </div>
      ) : null}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}
