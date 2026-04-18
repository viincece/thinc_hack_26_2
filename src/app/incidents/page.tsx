import Link from "next/link";
import { manex, type DefectDetail } from "@/lib/manex";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge, severityVariant } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

async function loadDefects(): Promise<DefectDetail[]> {
  try {
    return await manex<DefectDetail[]>("/v_defect_detail", {
      order: "defect_ts.desc",
      limit: 100,
    });
  } catch {
    return [];
  }
}

export default async function IncidentsPage() {
  const rows = await loadDefects();
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
        <p className="text-sm text-zinc-500">
          Defects and field claims. Click a row to open its incident workspace.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent defects</CardTitle>
          <CardDescription>
            Latest {rows.length} rows from <code>v_defect_detail</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-5 py-2 text-left">When</th>
                <th className="px-5 py-2 text-left">Code</th>
                <th className="px-5 py-2 text-left">Severity</th>
                <th className="px-5 py-2 text-left">Product</th>
                <th className="px-5 py-2 text-left">Part</th>
                <th className="px-5 py-2 text-left">Occurrence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.defect_id}
                  className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900"
                >
                  <td className="px-5 py-2 text-zinc-500">
                    {d.ts?.slice(0, 10) ?? ""}
                  </td>
                  <td className="px-5 py-2 font-medium">
                    <Link
                      href={`/incidents/${d.defect_id}`}
                      className="hover:underline"
                    >
                      {d.defect_code}
                    </Link>
                  </td>
                  <td className="px-5 py-2">
                    <Badge variant={severityVariant(d.severity)}>
                      {d.severity}
                    </Badge>
                  </td>
                  <td className="px-5 py-2 text-zinc-700 dark:text-zinc-300">
                    {d.product_id}
                  </td>
                  <td className="px-5 py-2 text-zinc-700 dark:text-zinc-300">
                    {d.reported_part_number ?? "—"}
                  </td>
                  <td className="px-5 py-2 text-zinc-500">
                    {d.occurrence_section_name ?? d.occurrence_section_id ?? "—"}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-6 text-center text-sm text-zinc-500"
                  >
                    No data.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
