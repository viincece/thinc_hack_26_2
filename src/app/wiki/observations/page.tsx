import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listRecentObservations } from "@/lib/kg/browse";
import { KgBadge } from "@/components/wiki/kg-icon";

export const dynamic = "force-dynamic";

export default async function ObservationsPage() {
  const rows = await listRecentObservations(200).catch(() => []);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Observations</h1>
        <p className="text-sm text-zinc-500">
          Atomic claims. Each one is cite-able from any report. Click an
          observation to see what it&apos;s about and what sourced it.
        </p>
      </div>
      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No observations yet</CardTitle>
            <CardDescription>
              Seed the wiki or let the co-pilot write one during an
              investigation.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 p-3">
            {rows.map((o) => (
              <Link
                key={o.id}
                href={`/wiki/n/${encodeURIComponent(o.id)}`}
                className="block rounded-md border border-zinc-200 bg-white p-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <div className="mb-1 flex items-center gap-2">
                  <KgBadge kind="Observation" />
                  <span className="font-mono text-[11px] text-zinc-500">{o.id}</span>
                  <span className="ml-auto text-[11px] text-zinc-500">
                    conf {Math.round((o.confidence ?? 0) * 100)}%
                  </span>
                </div>
                <div className="text-zinc-700 dark:text-zinc-300">{o.text}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
