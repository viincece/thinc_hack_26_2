import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { graphAll } from "@/lib/kg/browse";
import { GraphClient } from "@/components/wiki/graph-client";

export const dynamic = "force-dynamic";

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;
  let data: Awaited<ReturnType<typeof graphAll>> = { nodes: [], edges: [] };
  let error: string | null = null;
  try {
    const raw = await graphAll();
    // Defensive clone so every value is a primitive — avoids stray class
    // instances or BigInt leaks tripping up the RSC serializer.
    data = {
      nodes: raw.nodes.map((n) => ({
        id: String(n.id),
        label: String(n.label ?? ""),
        kind: String(n.kind),
        subkind: n.subkind ? String(n.subkind) : undefined,
      })),
      edges: raw.edges.map((e) => ({
        from: String(e.from),
        to: String(e.to),
        rel: String(e.rel),
      })),
    };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Graph</h1>
        <p className="text-sm text-zinc-500">
          The whole wiki, laid out. Click a node to jump to its page. Pan with
          mouse-drag, zoom with scroll.
        </p>
      </div>
      {error ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader>
            <CardTitle>Graph query failed</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="h-[calc(100vh-12rem)] overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <GraphClient
            nodes={data.nodes}
            edges={data.edges}
            focus={focus ?? null}
          />
        </div>
      )}
    </div>
  );
}
