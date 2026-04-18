"use client";

/**
 * Client-side 8D → DOCX export via the `docx` library.
 *
 * Same style as the PDF export: an A4-like layout with a green header bar
 * per section, a concise value table, and failure pictures embedded at
 * the end of D2.
 *
 * The `docx` package is dynamic-imported so it doesn't land in the main
 * bundle.
 */

import type {
  EightDDoc,
  FieldMeta,
  FieldMetaMap,
} from "@/components/copilot/eight-d-doc";

type DocxLib = typeof import("docx");
type ImageBuf = { buffer: ArrayBuffer; name: string };

const IMMEDIATE_LABEL: Record<string, string> = {
  production_stop: "Production & delivery stop",
  customer_informed: "Customer purchasing informed",
  internal_info: "Internal information",
  sample_request: "Sample parts requested",
  warehouse_sort: "Warehouse sorting",
  derogation: "Derogation / concession",
  sub_supplier_claim: "Sub-supplier claim",
  additional_controls: "Additional controls",
  other: "Other",
};

const PREVENTIVE_LABEL: Record<string, string> = {
  work_instruction: "Work instruction",
  spc: "SPC",
  control_plan: "Control plan",
  fmea: "FMEA",
  preventive_maintenance: "Preventive maintenance",
  other: "Other",
};

const STATUS_LABEL: Record<string, string> = {
  filled: "grounded",
  suggested: "AI suggestion",
  needs_input: "needs input",
};

function yesNo(v: string | undefined | null) {
  return v === "yes" ? "Yes" : v === "no" ? "No" : "";
}

function memberString(m?: {
  name?: string;
  department?: string;
  contact?: string;
}) {
  if (!m) return "";
  return [m.name, m.department, m.contact].filter(Boolean).join(" · ");
}

async function fetchImage(src: string): Promise<ImageBuf | null> {
  if (!src) return null;
  try {
    let blob: Blob;
    if (src.startsWith("data:")) {
      const r = await fetch(src);
      blob = await r.blob();
    } else {
      const r = await fetch(src);
      if (!r.ok) return null;
      blob = await r.blob();
    }
    const buffer = await blob.arrayBuffer();
    return { buffer, name: src };
  } catch {
    return null;
  }
}

/** Small helper: make a single-paragraph text run. */
function p(D: DocxLib, text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new D.Paragraph({
    children: [
      new D.TextRun({
        text,
        bold: opts.bold,
        size: opts.size,
        color: opts.color,
      }),
    ],
  });
}

function sectionTitle(D: DocxLib, id: string, title: string) {
  return new D.Paragraph({
    spacing: { before: 240, after: 80 },
    shading: { type: D.ShadingType.SOLID, color: "10B981", fill: "10B981" },
    children: [
      new D.TextRun({
        text: ` ${id}  `,
        bold: true,
        size: 24,
        color: "FFFFFF",
      }),
      new D.TextRun({ text: title, bold: true, size: 22, color: "FFFFFF" }),
    ],
  });
}

function labelValue(
  D: DocxLib,
  label: string,
  value: string | undefined | null,
  meta?: FieldMeta,
) {
  const runs: import("docx").TextRun[] = [
    new D.TextRun({
      text: `${label}: `,
      bold: true,
      size: 18,
      color: "6B7280",
    }),
    new D.TextRun({
      text: value && value.length ? value : "—",
      size: 20,
    }),
  ];
  if (meta?.status && meta.status !== "empty" && meta.status !== "filled") {
    runs.push(
      new D.TextRun({
        text: `  (${STATUS_LABEL[meta.status]})`,
        size: 16,
        color: meta.status === "needs_input" ? "B45309" : "7C3AED",
        italics: true,
      }),
    );
  }
  const blocks: (import("docx").Paragraph)[] = [
    new D.Paragraph({ spacing: { after: 60 }, children: runs }),
  ];
  if (meta?.status === "needs_input" && meta.note) {
    blocks.push(
      new D.Paragraph({
        spacing: { after: 60 },
        children: [
          new D.TextRun({
            text: `   needs: ${meta.note}`,
            size: 16,
            italics: true,
            color: "B45309",
          }),
        ],
      }),
    );
  } else if (meta?.source) {
    blocks.push(
      new D.Paragraph({
        spacing: { after: 60 },
        children: [
          new D.TextRun({
            text: `   evidence: ${meta.source}`,
            size: 14,
            font: "Courier New",
            color: "6B7280",
          }),
        ],
      }),
    );
  }
  return blocks;
}

function table(
  D: DocxLib,
  headers: string[],
  rows: string[][],
  colWidths?: number[], // percent
) {
  const widths =
    colWidths ?? new Array(headers.length).fill(100 / headers.length);
  return new D.Table({
    width: { size: 100, type: D.WidthType.PERCENTAGE },
    rows: [
      new D.TableRow({
        tableHeader: true,
        children: headers.map((h, i) =>
          new D.TableCell({
            width: { size: widths[i]!, type: D.WidthType.PERCENTAGE },
            shading: { type: D.ShadingType.SOLID, color: "F3F4F6", fill: "F3F4F6" },
            children: [
              new D.Paragraph({
                children: [new D.TextRun({ text: h, bold: true, size: 18 })],
              }),
            ],
          }),
        ),
      }),
      ...rows.map(
        (row) =>
          new D.TableRow({
            children: row.map((cell, i) =>
              new D.TableCell({
                width: { size: widths[i]!, type: D.WidthType.PERCENTAGE },
                children: [
                  new D.Paragraph({
                    children: [new D.TextRun({ text: cell || "—", size: 18 })],
                  }),
                ],
              }),
            ),
          }),
      ),
    ],
  });
}

export async function exportToDocx(input: {
  doc: EightDDoc;
  meta: FieldMetaMap;
  name: string;
  draftId: string | null;
}): Promise<Blob> {
  const D = await import("docx");
  const { doc, meta, name, draftId } = input;
  const today = new Date().toISOString().slice(0, 10);

  const imageBufs = await Promise.all(
    (doc.failureImages ?? []).map(async (img) => ({
      label: img.name,
      buf: await fetchImage(img.dataUrl ?? img.url ?? ""),
    })),
  );

  const children: (import("docx").Paragraph | import("docx").Table)[] = [];

  // Header
  children.push(
    new D.Paragraph({
      alignment: D.AlignmentType.LEFT,
      children: [
        new D.TextRun({ text: `8D Report — ${name}`, bold: true, size: 32 }),
      ],
    }),
    new D.Paragraph({
      spacing: { after: 200 },
      children: [
        new D.TextRun({
          text: `${draftId ? `ID ${draftId} · ` : ""}exported ${today}`,
          color: "6B7280",
          size: 18,
        }),
      ],
    }),
  );

  // D0
  children.push(sectionTitle(D, "D0", "Header & statement"));
  children.push(
    ...labelValue(D, "Complaint date", doc.complaintDate, meta["complaintDate"]),
    ...labelValue(D, "Report date", doc.reportDate, meta["reportDate"]),
  );
  children.push(p(D, "Customer", { bold: true, size: 20 }));
  children.push(
    ...labelValue(
      D,
      "Complaint no.",
      doc.customer?.complaintNo,
      meta["customer.complaintNo"],
    ),
    ...labelValue(
      D,
      "Article",
      [doc.customer?.articleNr, doc.customer?.articleName]
        .filter(Boolean)
        .join(" — "),
      meta["customer.articleName"] ?? meta["customer.articleNr"],
    ),
    ...labelValue(
      D,
      "Contact",
      [doc.customer?.contactPerson, doc.customer?.email, doc.customer?.phone]
        .filter(Boolean)
        .join(" · "),
      meta["customer.contactPerson"],
    ),
  );
  children.push(p(D, "Supplier", { bold: true, size: 20 }));
  children.push(
    ...labelValue(
      D,
      "Complaint no.",
      doc.supplier?.complaintNo,
      meta["supplier.complaintNo"],
    ),
    ...labelValue(
      D,
      "Article",
      [doc.supplier?.articleNr, doc.supplier?.articleName]
        .filter(Boolean)
        .join(" — "),
      meta["supplier.articleName"] ?? meta["supplier.articleNr"],
    ),
    ...labelValue(
      D,
      "Contact",
      [doc.supplier?.contactPerson, doc.supplier?.email, doc.supplier?.phone]
        .filter(Boolean)
        .join(" · "),
      meta["supplier.contactPerson"],
    ),
  );

  // D1
  children.push(sectionTitle(D, "D1", "Team"));
  children.push(
    ...labelValue(D, "Champion", memberString(doc.champion), meta["champion"]),
    ...labelValue(
      D,
      "Coordinator",
      memberString(doc.coordinator),
      meta["coordinator"],
    ),
  );
  children.push(p(D, "Team members", { bold: true, size: 20 }));
  children.push(
    table(
      D,
      ["Name", "Department", "Contact"],
      (doc.team ?? []).map((m) => [
        m.name ?? "",
        m.department ?? "",
        m.contact ?? "",
      ]),
      [34, 33, 33],
    ),
  );

  // D2
  children.push(sectionTitle(D, "D2", "Problem description"));
  children.push(...labelValue(D, "Problem", doc.problem, meta["problem"]));
  if (imageBufs.some((i) => i.buf)) {
    children.push(p(D, "Failure pictures", { bold: true, size: 20 }));
    for (const img of imageBufs) {
      if (!img.buf) continue;
      // 480×320 EMU = 120×80 px (approx). docx expects width/height in pixels
      // for the default 72 DPI; it maps internally to EMU.
      children.push(
        new D.Paragraph({
          spacing: { after: 60 },
          children: [
            new D.ImageRun({
              data: img.buf.buffer,
              transformation: { width: 260, height: 180 },
              type: "png",
            }),
          ],
        }),
        new D.Paragraph({
          spacing: { after: 80 },
          children: [
            new D.TextRun({ text: img.label, italics: true, size: 16, color: "6B7280" }),
          ],
        }),
      );
    }
  }

  // D3
  children.push(sectionTitle(D, "D3", "Immediate containment"));
  children.push(p(D, "Location of suspect parts", { bold: true, size: 20 }));
  children.push(
    table(
      D,
      ["Location", "Qty", "Done", "Date code / PO / charge"],
      (
        [
          ["In production", doc.suspect?.inProduction],
          ["In warehouse", doc.suspect?.inWarehouse],
          ["In transit", doc.suspect?.inTransit],
          ["At customer", doc.suspect?.atCustomer],
        ] as const
      ).map(([label, loc]) => [
        label,
        loc?.qty ?? "",
        loc?.conducted ? "Yes" : "No",
        loc?.reference ?? "",
      ]),
      [30, 10, 10, 50],
    ),
  );
  children.push(p(D, "Immediate actions", { bold: true, size: 20 }));
  children.push(
    table(
      D,
      ["Action", "On", "Responsible", "Due", "Description", "Eff %"],
      Object.entries(doc.immediate ?? {}).map(([k, item]) => [
        IMMEDIATE_LABEL[k] ?? k,
        item.enabled ? "Yes" : "No",
        item.responsible ?? "",
        item.dueDate ?? "",
        item.description ?? "",
        item.effectiveness != null ? `${item.effectiveness}%` : "",
      ]),
      [22, 7, 18, 12, 33, 8],
    ),
  );
  children.push(
    ...labelValue(
      D,
      "First OK delivery — PO",
      doc.firstOkPo,
      meta["firstOkPo"],
    ),
    ...labelValue(
      D,
      "First OK delivery — ship date",
      doc.firstOkDate,
      meta["firstOkDate"],
    ),
  );

  // D4
  children.push(sectionTitle(D, "D4", "Root cause analysis"));
  for (const path of ["occurrence", "detection"] as const) {
    const block = doc[path];
    const m = meta[path];
    children.push(
      p(
        D,
        path === "occurrence"
          ? "Why did the failure occur?"
          : "Why was the failure not detected?",
        { bold: true, size: 20 },
      ),
    );
    if (m?.status && m.status !== "empty" && m.status !== "filled") {
      children.push(
        p(D, `(${STATUS_LABEL[m.status]})`, { size: 16, color: "7C3AED" }),
      );
    }
    if (block?.categories?.length) {
      children.push(p(D, `Categories: ${block.categories.join(", ")}`));
    }
    if (block?.potentialCause) {
      children.push(p(D, `Potential cause: ${block.potentialCause}`));
    }
    if (block?.whys?.some(Boolean)) {
      block.whys.forEach((w, i) => {
        children.push(p(D, `Why ${i + 1}: ${w || "—"}`));
      });
    }
    if (block?.rootCauses?.some((r) => r.text)) {
      children.push(
        table(
          D,
          ["#", "Root cause", "Participation %"],
          block.rootCauses.map((r, i) => [
            String(i + 1),
            r.text ?? "",
            r.participation != null ? `${r.participation}%` : "",
          ]),
          [10, 70, 20],
        ),
      );
    }
  }

  // D5
  children.push(sectionTitle(D, "D5", "Planned corrective actions"));
  for (const [title, rows] of [
    ["For failure occurrence", doc.plannedOccurrence ?? []],
    ["For failure detection", doc.plannedDetection ?? []],
  ] as const) {
    children.push(p(D, title, { bold: true, size: 20 }));
    children.push(
      table(
        D,
        ["RC #", "Action", "Responsible", "Date"],
        rows.map((r) => [
          r.rootCauseNo ?? "",
          r.description ?? "",
          r.responsible ?? "",
          r.date ?? "",
        ]),
        [10, 55, 20, 15],
      ),
    );
  }
  children.push(
    ...labelValue(
      D,
      "Risk of inducing a new failure",
      yesNo(doc.riskOfNewFailure),
      meta["riskOfNewFailure"],
    ),
  );

  // D6
  children.push(sectionTitle(D, "D6", "Implemented corrective actions"));
  for (const [title, rows] of [
    ["For failure occurrence", doc.implementedOccurrence ?? []],
    ["For failure detection", doc.implementedDetection ?? []],
  ] as const) {
    children.push(p(D, title, { bold: true, size: 20 }));
    children.push(
      table(
        D,
        ["RC #", "Action", "Date", "Eff %", "Note"],
        rows.map((r) => [
          r.rootCauseNo ?? "",
          r.description ?? "",
          r.date ?? "",
          r.effectiveness != null ? `${r.effectiveness}%` : "",
          r.note ?? "",
        ]),
        [8, 45, 12, 10, 25],
      ),
    );
  }

  // D7
  children.push(sectionTitle(D, "D7", "Preventive actions"));
  children.push(
    table(
      D,
      ["Update", "Yes/No", "Responsible", "Due", "End"],
      Object.entries(doc.preventive ?? {}).map(([k, item]) => [
        PREVENTIVE_LABEL[k] ?? k,
        item.applicable || "",
        item.responsible ?? "",
        item.dueDate ?? "",
        item.endDate ?? "",
      ]),
      [30, 14, 28, 14, 14],
    ),
  );
  children.push(
    ...labelValue(
      D,
      "Transferred to similar processes",
      yesNo(doc.transferredToSimilar),
      meta["transferredToSimilar"],
    ),
    ...labelValue(
      D,
      "Other parts affected",
      yesNo(doc.otherPartsAffected),
      meta["otherPartsAffected"],
    ),
  );
  if (doc.otherPartsAffected === "yes" && doc.otherPartsWhich) {
    children.push(
      ...labelValue(
        D,
        "Which parts",
        doc.otherPartsWhich,
        meta["otherPartsWhich"],
      ),
    );
  }

  // D8
  children.push(sectionTitle(D, "D8", "Closure"));
  children.push(
    ...labelValue(
      D,
      "Team appreciation / closing note",
      doc.appreciation,
      meta["appreciation"],
    ),
  );

  const docx = new D.Document({
    creator: "Quality Co-Pilot",
    title: name,
    description: "8D Report",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 20 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children,
      },
    ],
  });

  return await D.Packer.toBlob(docx);
}
