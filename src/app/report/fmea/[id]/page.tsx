import { notFound } from "next/navigation";
import { loadFmea } from "@/lib/fmea/store";
import { FmeaEditor } from "@/components/fmea/fmea-editor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FmeaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await loadFmea(id);
  if (!doc) notFound();
  return <FmeaEditor initial={doc} />;
}
