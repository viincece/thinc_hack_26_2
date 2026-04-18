import Link from "next/link";
import { ArrowLeft, ExternalLink, Network } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { nodeDetail } from "@/lib/kg/browse";
import { KgBadge, kindMeta } from "@/components/wiki/kg-icon";
import { Markdown } from "@/components/wiki/markdown";

export const dynamic = "force-dynamic";

export default async function NodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const bundle = await nodeDetail(decoded).catch(() => null);

  if (!bundle || !bundle.node) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/wiki">
            <ArrowLeft className="h-4 w-4" /> Wiki
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Node not found</CardTitle>
            <CardDescription>
              No node with id <code>{decoded}</code> in the graph.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { node, neighbors } = bundle;
  const obsIn = neighbors.filter(
    (n) => n.kind === "Observation" && n.direction === "in",
  );
  const obsOut = neighbors.filter(
    (n) => n.kind === "Observation" && n.direction === "out",
  );
  const structuralOut = neighbors.filter(
    (n) => n.direction === "out" && n.kind === "Entity" && !isReportRel(n.rel),
  );
  const structuralIn = neighbors.filter(
    (n) => n.direction === "in" && n.kind === "Entity" && !isReportRel(n.rel),
  );
  const conceptLinks = neighbors.filter((n) => n.kind === "Concept");
  const reportsAbout = neighbors.filter(
    (n) => n.kind === "Report" && n.direction === "in",
  );
  const sourceLinks = neighbors.filter((n) => n.kind === "Source");

  const displayKind = node.subkind || node.kind;
  const meta = kindMeta(displayKind);
  const Icon = meta.icon;

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm">
        <Link href="/wiki">
          <ArrowLeft className="h-4 w-4" /> Wiki
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${meta.bg} ${meta.ring}`}
          >
            <Icon className={`h-5 w-5 ${meta.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <KgBadge kind={node.kind} subkind={node.subkind} />
              <span className="font-mono text-[11px] text-zinc-500">{node.id}</span>
              {node.manex_id ? (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  manex:{node.manex_table}:{node.manex_id}
                </span>
              ) : null}
              {node.status ? (
                <Badge
                  variant={
                    node.status === "final"
                      ? "success"
                      : node.status === "superseded"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {node.status}
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {node.label}
            </h1>
            {typeof node.confidence === "number" ? (
              <div className="mt-1 text-xs text-zinc-500">
                confidence {Math.round(node.confidence * 100)}%
                {node.first_seen
                  ? ` · first seen ${node.first_seen.slice(0, 10)}`
                  : ""}
              </div>
            ) : null}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link
            href={`/wiki/graph?focus=${encodeURIComponent(node.id)}`}
          >
            <Network className="h-3.5 w-3.5" /> Show in graph
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {node.body ? (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
                <CardDescription>
                  LLM-maintained page body. Refreshes when new observations
                  arrive.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Markdown content={node.body} />
                {node.url ? (
                  <div className="mt-3 inline-flex items-center gap-1 text-xs text-sky-600">
                    <ExternalLink className="h-3 w-3" />
                    <span className="font-mono">{node.url}</span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {obsIn.length ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  Observations {obsOut.length ? "citing this" : "about this"}
                </CardTitle>
                <CardDescription>
                  Atomic claims that reference this node.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {obsIn.map((o) => (
                  <Link
                    key={o.id}
                    href={`/wiki/n/${encodeURIComponent(o.id)}`}
                    className="block rounded-md border border-zinc-200 p-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <KgBadge kind="Observation" />
                      <span className="font-mono text-[11px] text-zinc-500">{o.id}</span>
                      <span className="ml-auto rounded bg-zinc-100 px-1 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {o.rel}
                      </span>
                    </div>
                    <div className="line-clamp-3 text-zinc-700 dark:text-zinc-300">
                      {o.label}
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {obsOut.length && node.kind === "Report" ? (
            <Card>
              <CardHeader>
                <CardTitle>Observations contained</CardTitle>
                <CardDescription>Building blocks of this report.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {obsOut.map((o) => (
                  <Link
                    key={o.id}
                    href={`/wiki/n/${encodeURIComponent(o.id)}`}
                    className="block rounded-md border border-zinc-200 p-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <span className="mr-2 font-mono text-[11px] text-zinc-500">
                      {o.id}
                    </span>
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {o.label}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {structuralOut.length || structuralIn.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Structural links</CardTitle>
                <CardDescription>
                  How this entity connects to others in the factory graph.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <NeighborList
                  title="Out"
                  items={structuralOut}
                  arrow="→"
                />
                <NeighborList title="In" items={structuralIn} arrow="←" />
              </CardContent>
            </Card>
          ) : null}

          {conceptLinks.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Concepts</CardTitle>
                <CardDescription>
                  Abstractions this node participates in.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {conceptLinks.map((n) => (
                  <Link
                    key={`${n.id}-${n.direction}-${n.rel}`}
                    href={`/wiki/n/${encodeURIComponent(n.id)}`}
                    className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    {n.label}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {reportsAbout.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Reports</CardTitle>
                <CardDescription>Past reports mentioning this node.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {reportsAbout.map((r) => (
                  <Link
                    key={r.id}
                    href={`/wiki/n/${encodeURIComponent(r.id)}`}
                    className="block rounded-md border border-zinc-200 p-2 text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <div className="flex items-center gap-2">
                      <KgBadge kind="Report" />
                      <span className="truncate">{r.label}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {sourceLinks.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Sources</CardTitle>
                <CardDescription>Where the claims came from.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {sourceLinks.map((s) => (
                  <Link
                    key={`${s.id}-${s.rel}`}
                    href={`/wiki/n/${encodeURIComponent(s.id)}`}
                    className="flex items-center gap-2 rounded-md border border-zinc-200 p-2 text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <KgBadge kind="Source" />
                    <span className="truncate">{s.label}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NeighborList({
  title,
  items,
  arrow,
}: {
  title: string;
  items: Array<{ id: string; label: string; rel: string; kind: string }>;
  arrow: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <div className="space-y-1">
        {items.map((n) => (
          <Link
            key={`${n.id}-${n.rel}`}
            href={`/wiki/n/${encodeURIComponent(n.id)}`}
            className="flex items-center gap-2 rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <span className="font-mono text-[10px] text-zinc-400">{arrow}</span>
            <span className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {n.rel}
            </span>
            <span className="truncate">{n.label || n.id}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function isReportRel(rel: string) {
  return rel.startsWith("REPORT_") || rel === "CONTAINS";
}
