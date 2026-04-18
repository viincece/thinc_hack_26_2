"use client";

import { useMemo } from "react";
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
import { kindMeta } from "./kg-icon";

type GraphNode = {
  id: string;
  label: string;
  kind: string;
  subkind?: string;
};
type GraphEdge = { from: string; to: string; rel: string };

function NodeCard({
  data,
}: {
  data: { label: string; kind: string; subkind?: string; focused: boolean };
}) {
  const meta = kindMeta(data.subkind || data.kind);
  const Icon = meta.icon;
  return (
    <div
      className={`w-52 rounded-md border bg-white p-2 text-xs shadow-sm ${
        data.focused
          ? "border-emerald-400 ring-2 ring-emerald-200"
          : "border-zinc-200"
      } dark:bg-zinc-950 dark:border-zinc-800`}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-400" />
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded ${meta.bg} ring-1 ring-inset ${meta.ring}`}
        >
          <Icon className={`h-3 w-3 ${meta.color}`} />
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {data.subkind || data.kind}
        </span>
      </div>
      <div className="line-clamp-2 font-medium leading-tight text-zinc-900 dark:text-zinc-100">
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-zinc-400" />
    </div>
  );
}

const nodeTypes = { kg: NodeCard };

/**
 * Force-ish layout: cluster by kind on a radial grid, then let React Flow
 * render. Simple, deterministic, and looks good for < 200 nodes.
 */
function layout(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const byKind = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const k = n.subkind || n.kind;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(n);
  }
  const kindList = [...byKind.keys()].sort();
  const pos = new Map<string, { x: number; y: number }>();

  const radius = 520;
  const cx = 0;
  const cy = 0;
  kindList.forEach((k, ki) => {
    const items = byKind.get(k)!;
    const angle = (2 * Math.PI * ki) / kindList.length - Math.PI / 2;
    const centerX = cx + radius * Math.cos(angle);
    const centerY = cy + radius * Math.sin(angle);
    items.forEach((node, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      pos.set(node.id, {
        x: centerX + col * 240 - 240,
        y: centerY + row * 110 - 55,
      });
    });
  });
  return pos;
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

  const flowNodes: Node[] = useMemo(() => {
    const pos = layout(nodes);
    return nodes.map((n) => {
      const p = pos.get(n.id) ?? { x: 0, y: 0 };
      return {
        id: n.id,
        type: "kg",
        position: p,
        data: {
          label: n.label,
          kind: n.kind,
          subkind: n.subkind,
          focused: n.id === focus,
        },
      };
    });
  }, [nodes, focus]);

  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((e, i) => ({
        id: `e${i}-${e.from}-${e.to}`,
        source: e.from,
        target: e.to,
        label: e.rel,
        labelStyle: { fontSize: 9, fill: "#71717a" },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.8 },
        style: { stroke: "#a1a1aa", strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#a1a1aa" },
      })),
    [edges],
  );

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.2}
      maxZoom={2}
      onNodeClick={(_, node) => {
        router.push(`/wiki/n/${encodeURIComponent(node.id)}`);
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} color="#e4e4e7" />
      <MiniMap pannable zoomable nodeStrokeWidth={2} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
