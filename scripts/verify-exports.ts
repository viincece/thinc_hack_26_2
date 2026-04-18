/**
 * Offline sanity check: render a fixture 8D via both exporters, then scan
 * the resulting bytes for any leaked internal labels (grounded / AI
 * suggestion / needs input / Needs: / evidence:). Run with:
 *     npx tsx scripts/verify-exports.ts
 */
import { defaultDoc } from "../src/components/copilot/eight-d-doc";
import type { FieldMetaMap } from "../src/components/copilot/eight-d-doc";
import { exportToPdf } from "../src/lib/export/export-pdf";
import { exportToDocx } from "../src/lib/export/export-docx";

function scan(blobText: string, needles: string[]) {
  return needles.filter((s) => blobText.includes(s));
}

async function main() {
  const doc = defaultDoc();
  doc.problem =
    "Cold solder joint on PRD-00099 (Motor Controller MC-200). Fuse blew on power-up.";
  doc.customer = {
    complaintNo: "REK-2026-0042",
    articleNr: "ART-00001",
    articleName: "Motor Controller MC-200",
    drawingIndex: "",
    contactPerson: "",
    email: "",
    phone: "",
  };
  doc.supplier = {
    complaintNo: "",
    articleNr: "PM-00008",
    articleName: "LED 5mm rot",
    drawingIndex: "",
    contactPerson: "",
    email: "",
    phone: "",
  };
  doc.occurrence = {
    categories: ["Man", "Method"],
    potentialCause:
      "Dry solder joints on the DC jack caused short-circuit on power-up.",
    whys: [
      "Why did the fuse blow? — Short circuit at power-on.",
      "Why the short? — Dry solder on DC jack.",
      "Why dry joint? — Iron insufficient.",
      "",
      "",
    ],
    rootCauses: [
      { text: "Dry joint at DC jack", participation: 70 },
      { text: "Soldering iron degradation at SEC-00010", participation: 30 },
    ],
  };

  const meta: FieldMetaMap = {
    complaintDate: { status: "filled", source: "DEF-00098" },
    "customer.email": { status: "needs_input", note: "Ask the engineer." },
    "supplier.contactPerson": { status: "suggested", source: "SB-00005" },
    occurrence: { status: "suggested", source: "DEF-00098" },
    problem: { status: "filled", source: "DEF-00098, PRD-00099" },
  };

  const pdfBlob = await exportToPdf({
    name: "Fixture 8D",
    draftId: "8D-TEST-0001",
    doc,
    meta,
  });
  const pdfBytes = Buffer.from(await pdfBlob.arrayBuffer()).toString("latin1");
  const pdfLeaks = scan(pdfBytes, [
    "grounded",
    "AI suggestion",
    "needs input",
    "Needs:",
    "evidence:",
  ]);
  console.log("PDF  :", pdfBytes.length, "bytes", "leaks →", pdfLeaks);

  const docxBlob = await exportToDocx({
    name: "Fixture 8D",
    draftId: "8D-TEST-0001",
    doc,
    meta,
  });
  const docxBytes = Buffer.from(await docxBlob.arrayBuffer()).toString(
    "latin1",
  );
  const docxLeaks = scan(docxBytes, [
    "grounded",
    "AI suggestion",
    "needs input",
    "needs: Enter",
    "evidence:",
  ]);
  console.log("DOCX :", docxBytes.length, "bytes", "leaks →", docxLeaks);

  // Optionally dump fixtures for visual inspection.
  if (process.argv.includes("--write")) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(
      "fixture-export.pdf",
      Buffer.from(await pdfBlob.arrayBuffer()),
    );
    await fs.writeFile(
      "fixture-export.docx",
      Buffer.from(await docxBlob.arrayBuffer()),
    );
    console.log("wrote fixture-export.pdf + fixture-export.docx");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
