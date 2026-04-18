import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSources } from "@/lib/kg/browse";
import { KgBadge } from "@/components/wiki/kg-icon";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const rows = await listSources().catch(() => []);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="text-sm text-zinc-500">
          Raw inputs the wiki was built from — SOPs, interviews, Manex rows,
          old 8D exports. Each observation traces back to one of these.
        </p>
      </div>
      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No sources ingested yet</CardTitle>
            <CardDescription>Seed or ingest a source.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <Link
              key={s.id}
              href={`/wiki/n/${encodeURIComponent(s.id)}`}
              className="block rounded-md border border-zinc-200 bg-white p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            >
              <div className="flex items-center gap-2">
                <KgBadge kind="Source" subkind={s.source_kind} />
                <span className="font-mono text-[11px] text-zinc-500">{s.id}</span>
                <span className="ml-auto text-[11px] text-zinc-500">
                  {s.ingested_at?.slice(0, 10)}
                </span>
              </div>
              <div className="mt-1 font-medium">{s.title}</div>
              {s.url ? (
                <div className="mt-1 truncate font-mono text-[11px] text-sky-600">
                  {s.url}
                </div>
              ) : null}
              {s.body ? (
                <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{s.body}</div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
