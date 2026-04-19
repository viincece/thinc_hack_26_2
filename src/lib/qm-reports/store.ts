import { store } from "@/lib/storage/object-store";
import type { QmSummary } from "./types";

export const QM_PREFIX = "qm-summaries";

function filenameFor(id: number): string {
  return `${id}.json`;
}

function keyFor(id: number): string {
  return `${QM_PREFIX}/${filenameFor(id)}`;
}

export async function loadSummary(id: number): Promise<QmSummary | null> {
  const raw = await store().get(keyFor(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as QmSummary;
  } catch {
    return null;
  }
}

export async function saveSummary(summary: QmSummary): Promise<void> {
  await store().put(
    keyFor(summary.reportId),
    JSON.stringify(summary, null, 2),
  );
}

export async function deleteSummary(id: number): Promise<boolean> {
  await store().remove(keyFor(id));
  return true;
}
