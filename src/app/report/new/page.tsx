import { ReportWorkspace } from "@/components/copilot/workspace";
import { manex, type DefectDetail, type FieldClaimRow } from "@/lib/manex";

export const dynamic = "force-dynamic";

async function buildContextNote({
  defect_id,
  field_claim_id,
}: {
  defect_id?: string;
  field_claim_id?: string;
}): Promise<string | undefined> {
  try {
    if (defect_id) {
      const rows = await manex<DefectDetail[]>("/v_defect_detail", {
        defect_id: `eq.${defect_id}`,
        limit: 1,
      });
      const d = rows[0];
      if (!d) return `Defect ${defect_id} not found.`;
      return (
        `defect_id=${d.defect_id} ` +
        `product_id=${d.product_id} ` +
        `article_id=${d.article_id ?? "?"} ` +
        `defect_code=${d.defect_code} ` +
        `severity=${d.severity} ` +
        `occurrence_section=${d.occurrence_section_id ?? "?"} ` +
        `reported_part=${d.reported_part_number ?? "?"} ` +
        `ts=${d.ts ?? "?"} ` +
        `notes=${(d.notes ?? "").slice(0, 200)}`
      );
    }
    if (field_claim_id) {
      const rows = await manex<FieldClaimRow[]>("/field_claim", {
        field_claim_id: `eq.${field_claim_id}`,
        limit: 1,
      });
      const fc = rows[0];
      if (!fc) return `Field claim ${field_claim_id} not found.`;
      return (
        `field_claim_id=${fc.field_claim_id} ` +
        `product_id=${fc.product_id} ` +
        `market=${fc.market ?? "?"} ` +
        `reported_part=${fc.reported_part_number ?? "?"} ` +
        `complaint_text="${(fc.complaint_text ?? "").slice(0, 400)}"`
      );
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export default async function NewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ defect_id?: string; field_claim_id?: string }>;
}) {
  const sp = await searchParams;
  const contextNote = await buildContextNote(sp);
  return <ReportWorkspace contextNote={contextNote} />;
}
