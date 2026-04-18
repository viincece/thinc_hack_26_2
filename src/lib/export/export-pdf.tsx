"use client";

/**
 * Client-side 8D → PDF export.
 *
 * Prior versions of this file used @react-pdf/renderer to emit a Blob
 * directly. That worked for minimal fixtures but deadlocked on real 8D
 * drafts — specifically, the layout engine got into an infinite CPU loop
 * when a narrow flex cell held a long identifier token like
 * "SOLDER_COLD/CONNECTION_OPEN", and the export button never came back.
 * See commit history for the bisect trace.
 *
 * The reliable path is the browser's own print-to-PDF pipeline: we build
 * a fully-styled HTML document, open it in a popup, auto-trigger
 * `window.print()`, and let the user "Save as PDF" from the native
 * dialog. No heavy layout engine, no Blob, no download.
 */

import type {
  EightDDoc,
  FieldMeta,
  FieldMetaMap,
} from "@/components/copilot/eight-d-doc";

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

function yesNo(v: string | undefined | null) {
  return v === "yes" ? "Yes" : v === "no" ? "No" : "";
}

function formatMember(m: {
  name?: string;
  department?: string;
  contact?: string;
} | undefined) {
  if (!m) return "";
  return [m.name, m.department, m.contact].filter(Boolean).join(" · ");
}

function esc(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Filled-in cell helper: shows em-dash for empty. */
function cell(v: unknown): string {
  return esc(v);
}

function displayed(meta: FieldMetaMap, path: string, value: unknown): string {
  const m: FieldMeta | undefined = meta[path];
  if (
    m?.status === "needs_input" ||
    value === null ||
    value === undefined ||
    value === ""
  )
    return "—";
  return esc(value);
}

function field(label: string, value: string, wide = false): string {
  return `<div class="field${wide ? " wide" : ""}">
    <div class="field-label">${esc(label)}</div>
    <div class="field-value">${value}</div>
  </div>`;
}

function renderCauseBlock(
  title: string,
  block: EightDDoc["occurrence"] | undefined,
): string {
  const whys = (block?.whys ?? []).filter((w) => w && w.trim().length > 0);
  const rootCauses = (block?.rootCauses ?? []).filter((r) => r.text);
  const parts: string[] = [`<h3 class="h2">${esc(title)}</h3>`];
  if (block?.categories && block.categories.length > 0) {
    parts.push(
      `<div class="sub"><div class="field-label">Categories</div><div class="field-value">${esc(
        block.categories.join(", "),
      )}</div></div>`,
    );
  }
  if (block?.potentialCause) {
    parts.push(
      `<div class="sub"><div class="field-label">Potential cause</div><div class="field-value">${esc(
        block.potentialCause,
      )}</div></div>`,
    );
  }
  if (whys.length > 0) {
    parts.push(
      `<div class="sub"><div class="h3">5 Whys</div><ol class="whys">${whys
        .map((w) => `<li>${esc(w)}</li>`)
        .join("")}</ol></div>`,
    );
  }
  if (rootCauses.length > 0) {
    parts.push(
      `<div class="sub"><div class="h3">Confirmed root causes</div>
        <table class="tbl">
          <thead><tr><th style="width:6%">#</th><th>Root cause</th><th style="width:10%">Part %</th></tr></thead>
          <tbody>${rootCauses
            .map(
              (r, i) =>
                `<tr><td>${i + 1}</td><td>${esc(r.text ?? "—")}</td><td>${
                  r.participation != null ? `${r.participation}%` : "—"
                }</td></tr>`,
            )
            .join("")}</tbody>
        </table></div>`,
    );
  }
  return `<div class="causeblock">${parts.join("")}</div>`;
}

function renderActionsTable(
  title: string,
  rows: Array<{
    rootCauseNo?: string;
    description?: string;
    responsible?: string;
    date?: string;
    effectiveness?: number;
    note?: string;
  }>,
  kind: "planned" | "implemented",
): string {
  const populated = rows.filter(
    (r) =>
      (r.description && r.description.trim()) ||
      (r.responsible && r.responsible.trim()) ||
      (r.date && r.date.trim()) ||
      r.effectiveness != null ||
      (r.note && r.note.trim()) ||
      (r.rootCauseNo && r.rootCauseNo.trim()),
  );
  const display = populated.length ? populated : rows.slice(0, 1);
  const header =
    kind === "planned"
      ? `<tr><th style="width:8%">RC #</th><th>Action</th><th style="width:18%">Responsible</th><th style="width:14%">Date</th></tr>`
      : `<tr><th style="width:8%">RC #</th><th>Action</th><th style="width:14%">Date</th><th style="width:10%">Eff %</th><th style="width:22%">Note</th></tr>`;
  const body = display
    .map((r) => {
      const common = `<td>${cell(r.rootCauseNo)}</td><td>${cell(
        r.description,
      )}</td>`;
      if (kind === "planned") {
        return `<tr>${common}<td>${cell(r.responsible)}</td><td>${cell(
          r.date,
        )}</td></tr>`;
      }
      return `<tr>${common}<td>${cell(r.date)}</td><td>${
        r.effectiveness != null ? `${r.effectiveness}%` : "—"
      }</td><td>${cell(r.note)}</td></tr>`;
    })
    .join("");
  return `<div class="causeblock"><div class="h3">${esc(
    title,
  )}</div><table class="tbl"><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
}

function renderSection(id: string, title: string, body: string): string {
  return `<section class="section"><header class="section-head"><span class="section-badge">${esc(
    id,
  )}</span><span class="section-title">${esc(
    title,
  )}</span></header><div class="section-body">${body}</div></section>`;
}

function buildHtml(
  doc: EightDDoc,
  meta: FieldMetaMap,
  name: string,
  draftId: string | null,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const fld = (label: string, value: unknown, path: string, wide = false) =>
    field(label, displayed(meta, path, value), wide);

  // D0
  const d0 = `
    <div class="row">${fld("Complaint date", doc.complaintDate, "complaintDate")}${fld(
      "Report date",
      doc.reportDate,
      "reportDate",
    )}</div>
    <h4 class="h2">Customer</h4>
    <div class="row">${fld(
      "Complaint no.",
      doc.customer?.complaintNo,
      "customer.complaintNo",
    )}${fld("Article no.", doc.customer?.articleNr, "customer.articleNr")}</div>
    <div class="row">${fld(
      "Article name",
      doc.customer?.articleName,
      "customer.articleName",
      true,
    )}</div>
    <div class="row">${fld(
      "Contact",
      doc.customer?.contactPerson,
      "customer.contactPerson",
    )}${fld("Email", doc.customer?.email, "customer.email")}${fld(
      "Phone",
      doc.customer?.phone,
      "customer.phone",
    )}</div>
    <h4 class="h2">Supplier</h4>
    <div class="row">${fld(
      "Complaint no.",
      doc.supplier?.complaintNo,
      "supplier.complaintNo",
    )}${fld("Article no.", doc.supplier?.articleNr, "supplier.articleNr")}</div>
    <div class="row">${fld(
      "Article name",
      doc.supplier?.articleName,
      "supplier.articleName",
      true,
    )}</div>
    <div class="row">${fld(
      "Contact",
      doc.supplier?.contactPerson,
      "supplier.contactPerson",
    )}${fld("Email", doc.supplier?.email, "supplier.email")}${fld(
      "Phone",
      doc.supplier?.phone,
      "supplier.phone",
    )}</div>`;

  // D1
  const teamBody = doc.team && doc.team.length > 0
    ? `<table class="tbl"><thead><tr><th>Name</th><th>Department</th><th>Contact</th></tr></thead>
       <tbody>${doc.team
         .map(
           (m) =>
             `<tr><td>${cell(m.name)}</td><td>${cell(
               m.department,
             )}</td><td>${cell(m.contact)}</td></tr>`,
         )
         .join("")}</tbody></table>`
    : `<div class="field-value">No team members listed.</div>`;
  const d1 = `
    <div class="row">${fld("Champion", formatMember(doc.champion), "champion", true)}</div>
    <div class="row">${fld("Coordinator", formatMember(doc.coordinator), "coordinator", true)}</div>
    <h4 class="h2">Team members</h4>
    ${teamBody}`;

  // D2
  const imgs = (doc.failureImages ?? []).filter((i) => i.dataUrl || i.url);
  const imgStrip = imgs.length
    ? `<h4 class="h2">Failure pictures</h4><div class="img-strip">${imgs
        .map(
          (i) =>
            `<figure class="img-frame"><img src="${esc(
              i.dataUrl ?? i.url ?? "",
            )}" alt="${esc(i.name)}" /><figcaption>${esc(i.name)}</figcaption></figure>`,
        )
        .join("")}</div>`
    : "";
  const d2 = `${fld("Problem", doc.problem, "problem", true)}${imgStrip}`;

  // D3
  const suspectRows = [
    ["In production", doc.suspect?.inProduction],
    ["In warehouse", doc.suspect?.inWarehouse],
    ["In transit", doc.suspect?.inTransit],
    ["At customer", doc.suspect?.atCustomer],
  ] as const;
  const d3 = `
    <h4 class="h2">Location of suspect parts</h4>
    <table class="tbl">
      <thead><tr><th>Location</th><th style="width:10%">Qty</th><th style="width:12%">Done</th><th>Date code / PO / charge / cavity</th></tr></thead>
      <tbody>${suspectRows
        .map(
          ([label, loc]) =>
            `<tr><td>${esc(label)}</td><td>${cell(loc?.qty)}</td><td>${
              loc?.conducted ? "Yes" : "No"
            }</td><td>${cell(loc?.reference)}</td></tr>`,
        )
        .join("")}</tbody>
    </table>
    <h4 class="h2">Immediate actions</h4>
    <table class="tbl">
      <thead><tr><th style="width:18%">Action</th><th style="width:6%">On</th><th style="width:14%">Responsible</th><th style="width:10%">Due</th><th>Description</th><th style="width:8%">Eff %</th></tr></thead>
      <tbody>${Object.entries(doc.immediate ?? {})
        .map(
          ([k, item]) =>
            `<tr><td>${esc(IMMEDIATE_LABEL[k] ?? k)}</td><td>${
              item.enabled ? "Yes" : "No"
            }</td><td>${cell(item.responsible)}</td><td>${cell(
              item.dueDate,
            )}</td><td>${cell(item.description)}</td><td>${
              item.effectiveness != null ? `${item.effectiveness}%` : "—"
            }</td></tr>`,
        )
        .join("")}</tbody>
    </table>
    <div class="row">${fld("First OK delivery — PO #", doc.firstOkPo, "firstOkPo")}${fld("First OK delivery — ship date", doc.firstOkDate, "firstOkDate")}</div>`;

  // D4
  const d4 = `${renderCauseBlock(
    "Why did the failure occur?",
    doc.occurrence,
  )}${renderCauseBlock(
    "Why was the failure not detected?",
    doc.detection,
  )}`;

  // D5
  const d5 = `${renderActionsTable(
    "For failure occurrence",
    doc.plannedOccurrence ?? [],
    "planned",
  )}${renderActionsTable(
    "For failure detection",
    doc.plannedDetection ?? [],
    "planned",
  )}${fld(
    "Risk of inducing a new failure",
    yesNo(doc.riskOfNewFailure),
    "riskOfNewFailure",
  )}`;

  // D6
  const d6 = `${renderActionsTable(
    "For failure occurrence",
    doc.implementedOccurrence ?? [],
    "implemented",
  )}${renderActionsTable(
    "For failure detection",
    doc.implementedDetection ?? [],
    "implemented",
  )}`;

  // D7
  const d7 = `
    <table class="tbl">
      <thead><tr><th>Update</th><th style="width:10%">Yes/No</th><th style="width:18%">Responsible</th><th style="width:12%">Due</th><th style="width:12%">End</th></tr></thead>
      <tbody>${Object.entries(doc.preventive ?? {})
        .map(
          ([k, item]) =>
            `<tr><td>${esc(PREVENTIVE_LABEL[k] ?? k)}</td><td>${esc(
              item.applicable || "—",
            )}</td><td>${cell(item.responsible)}</td><td>${cell(
              item.dueDate,
            )}</td><td>${cell(item.endDate)}</td></tr>`,
        )
        .join("")}</tbody>
    </table>
    <div class="row">${fld(
      "Transferred to similar processes",
      yesNo(doc.transferredToSimilar),
      "transferredToSimilar",
    )}${fld(
      "Other parts affected",
      yesNo(doc.otherPartsAffected),
      "otherPartsAffected",
    )}</div>
    ${doc.otherPartsAffected === "yes" ? `<div class="row">${fld("Which parts", doc.otherPartsWhich, "otherPartsWhich", true)}</div>` : ""}`;

  // D8
  const d8 = fld(
    "Team appreciation / closing note",
    doc.appreciation,
    "appreciation",
    true,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>8D Report — ${esc(name)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #111827; font-size: 10pt; line-height: 1.35; }
  body { padding: 0; }
  h1, h2, h3, h4 { margin: 0; }
  .report-header { border-bottom: 1px solid #d1d5db; padding-bottom: 8px; margin-bottom: 14px; }
  .report-header h1 { font-size: 16pt; }
  .report-header .sub { color: #6b7280; font-size: 9pt; margin-top: 2px; }
  .section { margin-bottom: 14px; border: 1px solid #d1d5db; border-radius: 4px; overflow: hidden; page-break-inside: auto; break-inside: auto; }
  .section-head { background: #10b981; color: #fff; padding: 5px 10px; display: flex; align-items: center; gap: 6px; }
  .section-badge { background: #064e3b; padding: 1px 5px; border-radius: 2px; font-size: 9pt; font-weight: 700; }
  .section-title { font-size: 11pt; font-weight: 700; }
  .section-body { padding: 10px; background: #fff; }
  .row { display: flex; gap: 10px; margin-bottom: 6px; }
  .row > .field { flex: 1; }
  .row > .field.wide { flex: 1 1 100%; }
  .field-label { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px; }
  .field-value { font-size: 10pt; color: #111827; white-space: pre-wrap; word-break: break-word; }
  .sub { margin-bottom: 8px; }
  .h2 { font-size: 10pt; font-weight: 700; margin: 10px 0 4px; }
  .h3 { font-size: 9pt; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.4px; margin: 6px 0 4px; }
  .whys { margin: 4px 0 0; padding-left: 22px; }
  .whys li { margin-bottom: 3px; font-size: 9pt; }
  .tbl { width: 100%; border-collapse: collapse; margin-top: 4px; table-layout: fixed; }
  .tbl th, .tbl td { border: 1px solid #e5e7eb; padding: 4px 6px; font-size: 9pt; text-align: left; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
  .tbl th { background: #f3f4f6; color: #374151; font-weight: 700; font-size: 8pt; }
  .tbl tbody tr:nth-child(odd) { background: #fafafa; }
  .img-strip { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .img-frame { margin: 0; width: 120px; }
  .img-frame img { width: 120px; height: 80px; object-fit: cover; border: 1px solid #d1d5db; border-radius: 2px; }
  .img-frame figcaption { font-size: 7pt; color: #6b7280; margin-top: 1px; }
  .causeblock { margin-bottom: 10px; }
  .print-hint { position: fixed; top: 8px; right: 8px; background: #10b981; color: #fff; padding: 8px 12px; border-radius: 4px; font-size: 10pt; box-shadow: 0 2px 6px rgba(0,0,0,.15); z-index: 9999; }
  .print-hint button { margin-left: 8px; background: #fff; color: #064e3b; border: 0; border-radius: 3px; padding: 3px 8px; font-size: 9pt; font-weight: 700; cursor: pointer; }
  @media print { .print-hint { display: none; } .section { break-inside: auto; } .tbl { break-inside: auto; } .tbl tr { break-inside: avoid; } }
</style>
</head>
<body>
<div class="print-hint">Use your browser's print dialog to "Save as PDF" <button onclick="window.print()">Print</button></div>
<div class="report-header">
  <h1>8D Report — ${esc(name)}</h1>
  <div class="sub">${draftId ? `ID ${esc(draftId)} · ` : ""}exported ${esc(today)}</div>
</div>
${renderSection("D0", "Header & statement", d0)}
${renderSection("D1", "Team", d1)}
${renderSection("D2", "Problem description", d2)}
${renderSection("D3", "Immediate containment", d3)}
${renderSection("D4", "Root cause analysis", d4)}
${renderSection("D5", "Planned corrective actions", d5)}
${renderSection("D6", "Implemented corrective actions", d6)}
${renderSection("D7", "Preventive actions", d7)}
${renderSection("D8", "Closure", d8)}
<script>
  // Auto-trigger the print dialog once the document has rendered. The
  // setTimeout gives the browser a beat to lay out images + tables before
  // the preview snapshot is taken.
  window.addEventListener("load", function() { setTimeout(function(){ window.print(); }, 200); });
</script>
</body>
</html>`;
}

/**
 * Build the printable HTML for the draft, open it in a popup, and
 * auto-trigger the browser's print dialog. Resolves once the popup has
 * rendered — it does NOT wait for the user to click "Save".
 *
 * Returns a stub Blob containing the same HTML so callers that expect a
 * Blob (e.g. `triggerDownload`) still work if wired up — but the default
 * flow is to open the popup and let the user save from there.
 */
export async function exportToPdf(input: {
  doc: EightDDoc;
  meta: FieldMetaMap;
  name: string;
  draftId: string | null;
}): Promise<Blob> {
  const { doc, meta, name, draftId } = input;
  const html = buildHtml(doc, meta, name, draftId);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });

  if (typeof window !== "undefined") {
    const url = URL.createObjectURL(blob);
    // Open in a new tab. Since this runs from a direct user-click handler,
    // browsers do not treat it as a popup. The child tab auto-triggers
    // `window.print()` once its load handler fires — the print dialog is
    // modal inside that tab, not this one, so the editor stays responsive.
    const win = window.open(url, "_blank");
    if (!win) {
      URL.revokeObjectURL(url);
      // Fallback for popup-blocker corner cases: open inline so the user
      // can at least trigger print from the current tab via Ctrl+P.
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    } else {
      // Revoke once the child has had time to consume the URL.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }

  return blob;
}
