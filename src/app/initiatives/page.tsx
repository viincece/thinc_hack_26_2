import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { manex, type ProductActionRow } from "@/lib/manex";

export const dynamic = "force-dynamic";

async function load(): Promise<ProductActionRow[]> {
  try {
    return await manex<ProductActionRow[]>("/product_action", {
      order: "ts.desc",
      limit: 100,
    });
  } catch {
    return [];
  }
}

export default async function InitiativesPage() {
  const rows = await load();
  const byStatus = rows.reduce<Record<string, ProductActionRow[]>>((acc, r) => {
    (acc[r.status] ??= []).push(r);
    return acc;
  }, {});
  const columns = ["open", "in_progress", "done", "cancelled"] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Initiatives</h1>
        <p className="text-sm text-zinc-500">
          Corrective actions tracked via <code>product_action</code>. The
          co-pilot creates these from D5 of an 8D report.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <Card key={col}>
            <CardHeader>
              <CardTitle className="capitalize">
                {col.replace("_", " ")}
              </CardTitle>
              <CardDescription>
                {(byStatus[col]?.length ?? 0).toString()} actions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(byStatus[col] ?? []).slice(0, 10).map((r) => (
                <div
                  key={r.action_id}
                  className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-800"
                >
                  <div className="font-medium">{r.action_id}</div>
                  <div className="text-zinc-500">
                    {r.action_type} · {r.user_id}
                  </div>
                  {r.comments ? (
                    <div className="mt-1 line-clamp-2 text-zinc-600 dark:text-zinc-400">
                      {r.comments}
                    </div>
                  ) : null}
                </div>
              ))}
              {!(byStatus[col]?.length ?? 0) ? (
                <div className="rounded-md border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800">
                  Empty
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
