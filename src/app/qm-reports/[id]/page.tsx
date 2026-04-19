import { notFound } from "next/navigation";
import { getQmReport } from "@/lib/qm-reports/manex";
import { extractAndSaveSummary } from "@/lib/qm-reports/extract";
import { QmReportView } from "@/components/qm-reports/qm-report-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function QmReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const detail = await getQmReport(n);
  if (!detail) notFound();

  // First-visit summarisation, so the subpage never opens empty when
  // the row was never polled by the dashboard card.
  if (!detail.summary && detail.transcript.trim().length > 0) {
    try {
      const summary = await extractAndSaveSummary(n);
      if (summary) detail.summary = summary;
    } catch {
      /* render without summary — user can hit Regenerate */
    }
  }

  return <QmReportView initial={detail} />;
}
