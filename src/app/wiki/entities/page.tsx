import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listEntities, type EntitySummary } from "@/lib/kg/browse";
import { KgBadge, kindMeta } from "@/components/wiki/kg-icon";

export const dynamic = "force-dynamic";

export default async function EntitiesPage() {
  const ents: EntitySummary[] = await listEntities().catch(() => []);
  const groups = new Map<string, EntitySummary[]>();
  for (const e of ents) {
    if (!groups.has(e.kind)) groups.set(e.kind, []);
    groups.get(e.kind)!.push(e);
  }
  const order = [...groups.keys()].sort();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entities</h1>
        <p className="text-sm text-zinc-500">
          Named things from the shopfloor: parts, suppliers, batches,
          articles, sections, operators, defect/test codes. IDs match Manex
          where possible.
        </p>
      </div>
      {order.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No entities yet</CardTitle>
            <CardDescription>Run the seed: <code>npm run wiki:seed</code>.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {order.map((kind) => {
        const items = groups.get(kind)!;
        const meta = kindMeta(kind);
        return (
          <Card key={kind}>
            <CardHeader className="flex-row items-center gap-2">
              <meta.icon className={`h-4 w-4 ${meta.color}`} />
              <CardTitle>{kind}</CardTitle>
              <span className="ml-auto text-xs text-zinc-500">{items.length}</span>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((e) => (
                <Link
                  key={e.id}
                  href={`/wiki/n/${encodeURIComponent(e.id)}`}
                  className="group rounded-md border border-zinc-200 p-2 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div className="flex items-center gap-2">
                    <KgBadge kind={kind} />
                    <span className="font-mono text-[11px] text-zinc-500">{e.id}</span>
                    {e.manex_id ? (
                      <span className="ml-auto rounded bg-zinc-100 px-1 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800">
                        manex:{e.manex_id}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm font-medium">{e.label}</div>
                  {e.body ? (
                    <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{e.body}</div>
                  ) : null}
                </Link>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
