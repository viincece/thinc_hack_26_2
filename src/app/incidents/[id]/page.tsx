import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { manex, type DefectDetail } from "@/lib/manex";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge, severityVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { imageUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function loadDefect(id: string): Promise<DefectDetail | null> {
  try {
    const rows = await manex<DefectDetail[]>("/v_defect_detail", {
      defect_id: `eq.${id}`,
      limit: 1,
    });
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export default async function IncidentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await loadDefect(id);

  if (!d) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <Button asChild variant="ghost" size="sm">
          <Link href="/incidents">
            <ArrowLeft className="h-4 w-4" /> Incidents
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Incident not found</CardTitle>
            <CardDescription>
              Couldn&apos;t fetch defect <code>{id}</code>. Verify the ID or
              check API connectivity.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const img = imageUrl(d.image_url);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/incidents">
          <ArrowLeft className="h-4 w-4" /> Incidents
        </Link>
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {d.defect_code}
            </h1>
            <Badge variant={severityVariant(d.severity)}>{d.severity}</Badge>
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {d.defect_id} · {d.product_id} · {d.ts?.slice(0, 19).replace("T", " ")}
          </div>
        </div>
        <Button asChild>
          <Link href={`/report/new?defect_id=${d.defect_id}`}>Draft 8D</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              Raw row. The co-pilot will enrich this with BOM trace and
              historical context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Article" value={d.article_name ?? d.article_id} />
              <Field label="Reported part" value={d.reported_part_number} />
              <Field
                label="Occurrence section"
                value={d.occurrence_section_name ?? d.occurrence_section_id}
              />
              <Field
                label="Detected section"
                value={d.detected_section_name ?? d.detected_section_id}
              />
              <Field label="Cost" value={d.cost != null ? `€ ${d.cost}` : null} />
              <Field label="Source" value={d.source_type} />
            </dl>
            {d.notes ? (
              <p className="mt-4 rounded-md bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {d.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img}
                alt={d.defect_code}
                className="w-full rounded-md border border-zinc-200 dark:border-zinc-800"
              />
            ) : (
              <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
                No inspection image.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </>
  );
}
