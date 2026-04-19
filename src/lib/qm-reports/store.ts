import { promises as fs } from "node:fs";
import path from "node:path";
import type { QmSummary } from "./types";

export const SUMMARY_DIR = path.join(
  process.cwd(),
  "public",
  "qm-summaries",
);

async function ensureDir() {
  await fs.mkdir(SUMMARY_DIR, { recursive: true });
}

function filenameFor(id: number): string {
  return path.join(SUMMARY_DIR, `${id}.json`);
}

export async function loadSummary(id: number): Promise<QmSummary | null> {
  try {
    const raw = await fs.readFile(filenameFor(id), "utf8");
    return JSON.parse(raw) as QmSummary;
  } catch {
    return null;
  }
}

export async function saveSummary(summary: QmSummary): Promise<void> {
  await ensureDir();
  await fs.writeFile(
    filenameFor(summary.reportId),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
}

export async function deleteSummary(id: number): Promise<boolean> {
  try {
    await fs.unlink(filenameFor(id));
    return true;
  } catch {
    return false;
  }
}
