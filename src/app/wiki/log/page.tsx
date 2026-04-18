import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listLog } from "@/lib/kg/browse";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const rows = await listLog(200).catch(() => []);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-zinc-500">
          Chronological log of ingests, report closures, and wiki-lint runs.
        </p>
      </div>
      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Empty log</CardTitle>
            <CardDescription>Nothing has been written yet.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <Badge variant="outline">{r.action}</Badge>
                  <span className="text-zinc-700 dark:text-zinc-300">{r.summary}</span>
                  <span className="ml-auto font-mono text-[11px] text-zinc-500">
                    {r.ts?.slice(0, 19).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
