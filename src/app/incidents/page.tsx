import Link from "next/link";
import { FileText, ClipboardCheck } from "lucide-react";
import { manex, type DefectDetail } from "@/lib/manex";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge, severityVariant } from "@/components/ui/badge";
import { buildDraftsIndex, type DraftRef } from "@/lib/drafts-index";

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

/**
 * Short absolute stamp — "2026-04-18 14:23" — so the table shows
 * exactly when the defect was logged without burning a Date column.
 * Intentionally ISO-style (no locale reshuffle) so shop-floor Germans,
 * English-speaking customers, and grep-happy engineers all read it
 * the same.
 */
function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => n.toString().padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${date} ${time}`;
}

/** Rendered as the "When" cell — date on line 1, time on line 2. */
function StampCell({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-zinc-400">—</span>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span className="text-zinc-400">—</span>;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return (
    <div title={d.toISOString()}>
      <div className="text-zinc-700 dark:text-zinc-300">{date}</div>
      <div className="text-[11px] text-zinc-500">{time}</div>
    </div>
  );
}

/**
 * Icon + subtle text for a draft/analysis link attached to a defect.
 * Prop is called `draft` (not `ref`) because React reserves `ref`
 * for element refs — using it as a prop here strips it silently in
 * some render paths and throws on forwardRef-aware components.
 */
function DraftBadge({ draft }: { draft: DraftRef }) {
  const is8D = draft.kind === "8D";
  const Icon = is8D ? ClipboardCheck : FileText;
  const cls = is8D
    ? "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100"
    : "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100";
  return (
    <Link
      href={draft.href}
      title={`${draft.name} · created ${formatStamp(draft.createdAt)}`}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors ${cls}`}
    >
      <Icon className="h-3 w-3" />
      <span className="font-mono">{draft.id}</span>
    </Link>
  );
}

export default async function IncidentsPage() {
  const [rows, draftsIndex] = await Promise.all([
    loadDefects(),
    buildDraftsIndex(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
        <p className="text-sm text-zinc-500">
          Defects and field claims. Click a row to open its incident workspace
          — or jump straight to the 8D draft / analysis attached to it.
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
                <th className="px-5 py-2 text-left">Reports</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const refs = draftsIndex.byDefect.get(d.defect_id) ?? [];
                return (
                  <tr
                    key={d.defect_id}
                    className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900"
                  >
                    <td className="px-5 py-2 align-top">
                      <StampCell iso={d.ts} />
                    </td>
                    <td className="px-5 py-2 align-top font-medium">
                      <Link
                        href={`/incidents/${d.defect_id}`}
                        className="hover:underline"
                      >
                        {d.defect_code}
                      </Link>
                      <div className="font-mono text-[10px] text-zinc-400">
                        {d.defect_id}
                      </div>
                    </td>
                    <td className="px-5 py-2 align-top">
                      <Badge variant={severityVariant(d.severity)}>
                        {d.severity}
                      </Badge>
                    </td>
                    <td className="px-5 py-2 align-top text-zinc-700 dark:text-zinc-300">
                      {d.product_id}
                    </td>
                    <td className="px-5 py-2 align-top text-zinc-700 dark:text-zinc-300">
                      {d.reported_part_number ?? "—"}
                    </td>
                    <td className="px-5 py-2 align-top text-zinc-500">
                      {d.occurrence_section_name ?? d.occurrence_section_id ?? "—"}
                    </td>
                    <td className="px-5 py-2 align-top">
                      {refs.length ? (
                        <div className="flex flex-wrap gap-1">
                          {refs.map((r) => (
                            <DraftBadge key={`${r.kind}:${r.id}`} draft={r} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-zinc-400">
                          none yet
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td
                    colSpan={7}
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
