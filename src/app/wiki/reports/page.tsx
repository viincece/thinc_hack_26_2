import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listReports } from "@/lib/kg/browse";
import { KgBadge } from "@/components/wiki/kg-icon";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ReportsWikiPage() {
  const rows = await listReports().catch(() => []);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-zinc-500">
          Finished 8D and FMEA reports. When a report closes, it&apos;s filed
          here and becomes available to the co-pilot on the next incident.
        </p>
      </div>
      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No reports filed yet</CardTitle>
            <CardDescription>
              Close a draft from the{" "}
              <Link href="/report/new" className="underline">
                8D workspace
              </Link>{" "}
              and it will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/wiki/n/${encodeURIComponent(r.id)}`}
              className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white p-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            >
              <KgBadge kind="Report" subkind={r.report_kind} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.title}</div>
                <div className="truncate font-mono text-[11px] text-zinc-500">
                  {r.id} · {r.created_at?.slice(0, 10)}
                </div>
              </div>
              <Badge
                variant={
                  r.status === "final"
                    ? "success"
                    : r.status === "superseded"
                      ? "secondary"
                      : "outline"
                }
              >
                {r.status || "draft"}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
