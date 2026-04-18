"use client";

/**
 * Client-side 8D → PDF export via @react-pdf/renderer.
 *
 * Everything here runs in the browser. The @react-pdf/renderer build is
 * heavy, so we dynamic-import inside `exportToPdf` to keep it out of the
 * initial bundle.
 */

import type { ReactNode } from "react";
import type {
  EightDDoc,
  FieldMeta,
  FieldMetaMap,
} from "@/components/copilot/eight-d-doc";

type Status = FieldMeta["status"] | "empty";

const STATUS_COLOR: Record<Status, string> = {
  filled: "#047857",
  suggested: "#7c3aed",
  needs_input: "#b45309",
  empty: "#6b7280",
};

const STATUS_LABEL: Record<Status, string> = {
  filled: "grounded",
  suggested: "AI suggestion",
  needs_input: "needs input",
  empty: "empty",
};

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

async function resolveImageSrc(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:")) return src;
  try {
    const r = await fetch(src);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = () => res(String(reader.result ?? ""));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportToPdf(input: {
  doc: EightDDoc;
  meta: FieldMetaMap;
  name: string;
  draftId: string | null;
}): Promise<Blob> {
  const RPDF = await import("@react-pdf/renderer");
  const { Document, Page, StyleSheet, Text, View, Image, pdf } = RPDF;

  const styles = StyleSheet.create({
    page: {
      paddingTop: 32,
      paddingBottom: 36,
      paddingHorizontal: 36,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: "#111827",
    },
    header: {
      borderBottomWidth: 1,
      borderBottomColor: "#d1d5db",
      paddingBottom: 8,
      marginBottom: 12,
    },
    headerTitle: { fontSize: 16, fontWeight: "bold" },
    headerSub: { fontSize: 9, color: "#6b7280", marginTop: 2 },
    sectionCard: {
      marginBottom: 12,
      borderWidth: 1,
      borderColor: "#d1d5db",
      borderRadius: 4,
      overflow: "hidden",
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#10b981",
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    sectionBadge: {
      backgroundColor: "#064e3b",
      color: "#ffffff",
      paddingHorizontal: 4,
      borderRadius: 2,
      marginRight: 6,
      fontSize: 9,
      fontWeight: "bold",
    },
    sectionTitle: { fontSize: 11, fontWeight: "bold", color: "#ffffff" },
    sectionBody: { padding: 8 },
    row: { flexDirection: "row", gap: 6, marginBottom: 4 },
    col: { flex: 1 },
    fieldLabel: {
      fontSize: 8,
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 1,
    },
    fieldValue: { fontSize: 10, color: "#111827" },
    evidence: {
      fontSize: 7,
      fontFamily: "Courier",
      color: "#6b7280",
      marginTop: 1,
    },
    needsInputNote: {
      fontSize: 8,
      color: "#b45309",
      fontStyle: "italic",
      marginTop: 1,
    },
    statusPill: {
      fontSize: 7,
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderRadius: 2,
      marginLeft: 4,
    },
    table: {
      borderWidth: 1,
      borderColor: "#e5e7eb",
      borderRadius: 2,
      marginTop: 2,
    },
    tableHead: {
      flexDirection: "row",
      backgroundColor: "#f3f4f6",
      borderBottomWidth: 1,
      borderBottomColor: "#e5e7eb",
    },
    tableHeadCell: {
      flex: 1,
      padding: 3,
      fontSize: 8,
      fontWeight: "bold",
      color: "#374151",
    },
    tableRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: "#f1f5f9",
    },
    tableCell: { flex: 1, padding: 3, fontSize: 9 },
    imageStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      marginTop: 4,
    },
    imageFrame: {
      width: 120,
      height: 80,
      borderWidth: 1,
      borderColor: "#d1d5db",
      borderRadius: 2,
      overflow: "hidden",
    },
    imageCaption: {
      fontSize: 7,
      color: "#6b7280",
      marginTop: 1,
      maxWidth: 120,
    },
    footer: {
      position: "absolute",
      bottom: 18,
      left: 36,
      right: 36,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 8,
      color: "#9ca3af",
    },
    h2: { fontSize: 10, fontWeight: "bold", marginTop: 4, marginBottom: 2 },
  });

  const { doc, meta, name, draftId } = input;
  const today = new Date().toISOString().slice(0, 10);

  // Pre-resolve failure images so <Image> gets base64 data URLs.
  const resolvedImages = await Promise.all(
    (doc.failureImages ?? []).map(async (img) => ({
      name: img.name,
      src: await resolveImageSrc(img.dataUrl ?? img.url ?? ""),
    })),
  );

  function StatusPill({ meta: m }: { meta?: FieldMeta }) {
    const s = (m?.status ?? "empty") as Status;
    if (s === "empty") return null;
    return (
      <Text
        style={[
          styles.statusPill,
          { backgroundColor: STATUS_COLOR[s] + "22", color: STATUS_COLOR[s] },
        ]}
      >
        {STATUS_LABEL[s]}
      </Text>
    );
  }

  function Field({
    label,
    value,
    path,
    wide,
  }: {
    label: string;
    value: string | number | null | undefined;
    path: string;
    wide?: boolean;
  }) {
    const m = meta[path];
    const displayed =
      m?.status === "needs_input"
        ? "—"
        : value === undefined || value === null || value === ""
          ? "—"
          : String(value);
    return (
      <View style={wide ? { flexBasis: "100%", flexGrow: 1 } : styles.col}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <StatusPill meta={m} />
        </View>
        <Text style={styles.fieldValue}>{displayed}</Text>
        {m?.status === "needs_input" && m.note ? (
          <Text style={styles.needsInputNote}>Needs: {m.note}</Text>
        ) : null}
        {m?.source && m.status !== "needs_input" ? (
          <Text style={styles.evidence}>evidence: {m.source}</Text>
        ) : null}
      </View>
    );
  }

  function Section({
    id,
    title,
    children,
  }: {
    id: string;
    title: string;
    children: ReactNode;
  }) {
    return (
      <View style={styles.sectionCard} wrap>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionBadge}>{id}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.sectionBody}>{children}</View>
      </View>
    );
  }

  function CauseBlock({
    title,
    path,
    block,
  }: {
    title: string;
    path: "occurrence" | "detection";
    block: EightDDoc["occurrence"];
  }) {
    const m = meta[path];
    return (
      <View style={{ marginBottom: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.h2}>{title}</Text>
          {m?.status && m.status !== "empty" && m.status !== "filled" ? (
            <Text
              style={[
                styles.statusPill,
                {
                  backgroundColor: STATUS_COLOR[m.status] + "22",
                  color: STATUS_COLOR[m.status],
                },
              ]}
            >
              {STATUS_LABEL[m.status]}
            </Text>
          ) : null}
        </View>
        {block?.categories && block.categories.length > 0 ? (
          <Text style={styles.fieldValue}>
            Categories: {block.categories.join(", ")}
          </Text>
        ) : null}
        {block?.potentialCause ? (
          <Text style={styles.fieldValue}>
            Potential cause: {block.potentialCause}
          </Text>
        ) : null}
        {block?.whys && block.whys.some(Boolean) ? (
          <View style={{ marginTop: 2 }}>
            {block.whys.map((w, i) => (
              <Text key={i} style={{ fontSize: 9 }}>
                Why {i + 1}: {w || "—"}
              </Text>
            ))}
          </View>
        ) : null}
        {block?.rootCauses && block.rootCauses.some((r) => r.text) ? (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadCell, { flex: 0.4 }]}>#</Text>
              <Text style={styles.tableHeadCell}>Root cause</Text>
              <Text style={[styles.tableHeadCell, { flex: 0.5 }]}>Part %</Text>
            </View>
            {block.rootCauses.map((r, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 0.4 }]}>{i + 1}</Text>
                <Text style={styles.tableCell}>{r.text ?? "—"}</Text>
                <Text style={[styles.tableCell, { flex: 0.5 }]}>
                  {r.participation != null ? `${r.participation}%` : "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  function ActionsTable({
    title,
    rows,
    kind,
  }: {
    title: string;
    rows: Array<{
      rootCauseNo?: string;
      description?: string;
      responsible?: string;
      date?: string;
      effectiveness?: number;
      note?: string;
    }>;
    kind: "planned" | "implemented";
  }) {
    return (
      <View style={{ marginBottom: 6 }}>
        <Text style={styles.h2}>{title}</Text>
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 0.4 }]}>RC</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.6 }]}>Action</Text>
            {kind === "planned" ? (
              <Text style={styles.tableHeadCell}>Responsible</Text>
            ) : null}
            <Text style={[styles.tableHeadCell, { flex: 0.7 }]}>Date</Text>
            {kind === "implemented" ? (
              <>
                <Text style={[styles.tableHeadCell, { flex: 0.5 }]}>Eff %</Text>
                <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>Note</Text>
              </>
            ) : null}
          </View>
          {rows.map((r, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 0.4 }]}>
                {r.rootCauseNo ?? "—"}
              </Text>
              <Text style={[styles.tableCell, { flex: 1.6 }]}>
                {r.description ?? "—"}
              </Text>
              {kind === "planned" ? (
                <Text style={styles.tableCell}>{r.responsible ?? "—"}</Text>
              ) : null}
              <Text style={[styles.tableCell, { flex: 0.7 }]}>
                {r.date ?? "—"}
              </Text>
              {kind === "implemented" ? (
                <>
                  <Text style={[styles.tableCell, { flex: 0.5 }]}>
                    {r.effectiveness != null ? `${r.effectiveness}%` : "—"}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1.2 }]}>
                    {r.note ?? "—"}
                  </Text>
                </>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    );
  }

  const PdfDoc = (
    <Document title={name} author="S³ SixSigmaSense">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>8D Report — {name}</Text>
          <Text style={styles.headerSub}>
            {draftId ? `ID ${draftId} · ` : ""}exported {today}
          </Text>
        </View>

        <Section id="D0" title="Header & statement">
          <View style={styles.row}>
            <Field
              label="Complaint date"
              value={doc.complaintDate}
              path="complaintDate"
            />
            <Field
              label="Report date"
              value={doc.reportDate}
              path="reportDate"
            />
          </View>
          <Text style={styles.h2}>Customer</Text>
          <View style={styles.row}>
            <Field
              label="Complaint no."
              value={doc.customer?.complaintNo}
              path="customer.complaintNo"
            />
            <Field
              label="Article no."
              value={doc.customer?.articleNr}
              path="customer.articleNr"
            />
          </View>
          <View style={styles.row}>
            <Field
              label="Article name"
              value={doc.customer?.articleName}
              path="customer.articleName"
              wide
            />
          </View>
          <View style={styles.row}>
            <Field
              label="Contact"
              value={doc.customer?.contactPerson}
              path="customer.contactPerson"
            />
            <Field
              label="Email"
              value={doc.customer?.email}
              path="customer.email"
            />
            <Field
              label="Phone"
              value={doc.customer?.phone}
              path="customer.phone"
            />
          </View>
          <Text style={styles.h2}>Supplier</Text>
          <View style={styles.row}>
            <Field
              label="Complaint no."
              value={doc.supplier?.complaintNo}
              path="supplier.complaintNo"
            />
            <Field
              label="Article no."
              value={doc.supplier?.articleNr}
              path="supplier.articleNr"
            />
          </View>
          <View style={styles.row}>
            <Field
              label="Article name"
              value={doc.supplier?.articleName}
              path="supplier.articleName"
              wide
            />
          </View>
          <View style={styles.row}>
            <Field
              label="Contact"
              value={doc.supplier?.contactPerson}
              path="supplier.contactPerson"
            />
            <Field
              label="Email"
              value={doc.supplier?.email}
              path="supplier.email"
            />
            <Field
              label="Phone"
              value={doc.supplier?.phone}
              path="supplier.phone"
            />
          </View>
        </Section>

        <Section id="D1" title="Team">
          <View style={styles.row}>
            <Field
              label="Champion"
              value={formatMember(doc.champion)}
              path="champion"
              wide
            />
          </View>
          <View style={styles.row}>
            <Field
              label="Coordinator"
              value={formatMember(doc.coordinator)}
              path="coordinator"
              wide
            />
          </View>
          <Text style={styles.h2}>Team members</Text>
          {doc.team && doc.team.length > 0 ? (
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={styles.tableHeadCell}>Name</Text>
                <Text style={styles.tableHeadCell}>Department</Text>
                <Text style={styles.tableHeadCell}>Contact</Text>
              </View>
              {doc.team.map((m, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{m.name ?? "—"}</Text>
                  <Text style={styles.tableCell}>{m.department ?? "—"}</Text>
                  <Text style={styles.tableCell}>{m.contact ?? "—"}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.fieldValue}>No team members listed.</Text>
          )}
        </Section>

        <Section id="D2" title="Problem description">
          <Field label="Problem" value={doc.problem} path="problem" wide />
          {resolvedImages.some((i) => i.src) ? (
            <View>
              <Text style={styles.h2}>Failure pictures</Text>
              <View style={styles.imageStrip}>
                {resolvedImages.map((img, i) =>
                  img.src ? (
                    <View key={i} style={{ flexDirection: "column" }}>
                      <View style={styles.imageFrame}>
                        <Image
                          src={img.src}
                          style={{ width: 120, height: 80 }}
                        />
                      </View>
                      <Text style={styles.imageCaption}>{img.name}</Text>
                    </View>
                  ) : null,
                )}
              </View>
            </View>
          ) : null}
        </Section>

        <Section id="D3" title="Immediate containment">
          <Text style={styles.h2}>Location of suspect parts</Text>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={styles.tableHeadCell}>Location</Text>
              <Text style={[styles.tableHeadCell, { flex: 0.4 }]}>Qty</Text>
              <Text style={[styles.tableHeadCell, { flex: 0.5 }]}>Done</Text>
              <Text style={[styles.tableHeadCell, { flex: 1.6 }]}>
                Date code / PO / charge / cavity
              </Text>
            </View>
            {(
              [
                ["In production", doc.suspect?.inProduction],
                ["In warehouse", doc.suspect?.inWarehouse],
                ["In transit", doc.suspect?.inTransit],
                ["At customer", doc.suspect?.atCustomer],
              ] as const
            ).map(([label, loc]) => (
              <View key={label} style={styles.tableRow}>
                <Text style={styles.tableCell}>{label}</Text>
                <Text style={[styles.tableCell, { flex: 0.4 }]}>
                  {loc?.qty ?? "—"}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.5 }]}>
                  {loc?.conducted ? "Yes" : "No"}
                </Text>
                <Text style={[styles.tableCell, { flex: 1.6 }]}>
                  {loc?.reference ?? "—"}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.h2}>Immediate actions</Text>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadCell, { flex: 1.4 }]}>Action</Text>
              <Text style={[styles.tableHeadCell, { flex: 0.5 }]}>On</Text>
              <Text style={styles.tableHeadCell}>Responsible</Text>
              <Text style={[styles.tableHeadCell, { flex: 0.7 }]}>Due</Text>
              <Text style={styles.tableHeadCell}>Description</Text>
              <Text style={[styles.tableHeadCell, { flex: 0.5 }]}>Eff %</Text>
            </View>
            {Object.entries(doc.immediate ?? {}).map(([k, item]) => (
              <View key={k} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.4 }]}>
                  {IMMEDIATE_LABEL[k] ?? k}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.5 }]}>
                  {item.enabled ? "Yes" : "No"}
                </Text>
                <Text style={styles.tableCell}>{item.responsible ?? "—"}</Text>
                <Text style={[styles.tableCell, { flex: 0.7 }]}>
                  {item.dueDate ?? "—"}
                </Text>
                <Text style={styles.tableCell}>{item.description ?? "—"}</Text>
                <Text style={[styles.tableCell, { flex: 0.5 }]}>
                  {item.effectiveness != null
                    ? `${item.effectiveness}%`
                    : "—"}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.row}>
            <Field
              label="First OK delivery — PO #"
              value={doc.firstOkPo}
              path="firstOkPo"
            />
            <Field
              label="First OK delivery — ship date"
              value={doc.firstOkDate}
              path="firstOkDate"
            />
          </View>
        </Section>

        <Section id="D4" title="Root cause analysis">
          <CauseBlock
            title="Why did the failure occur?"
            path="occurrence"
            block={doc.occurrence}
          />
          <CauseBlock
            title="Why was the failure not detected?"
            path="detection"
            block={doc.detection}
          />
        </Section>

        <Section id="D5" title="Planned corrective actions">
          <ActionsTable
            title="For failure occurrence"
            rows={doc.plannedOccurrence ?? []}
            kind="planned"
          />
          <ActionsTable
            title="For failure detection"
            rows={doc.plannedDetection ?? []}
            kind="planned"
          />
          <Field
            label="Risk of inducing a new failure"
            value={yesNo(doc.riskOfNewFailure)}
            path="riskOfNewFailure"
          />
        </Section>

        <Section id="D6" title="Implemented corrective actions">
          <ActionsTable
            title="For failure occurrence"
            rows={doc.implementedOccurrence ?? []}
            kind="implemented"
          />
          <ActionsTable
            title="For failure detection"
            rows={doc.implementedDetection ?? []}
            kind="implemented"
          />
        </Section>

        <Section id="D7" title="Preventive actions">
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={styles.tableHeadCell}>Update</Text>
              <Text style={[styles.tableHeadCell, { flex: 0.5 }]}>Yes/No</Text>
              <Text style={styles.tableHeadCell}>Responsible</Text>
              <Text style={[styles.tableHeadCell, { flex: 0.7 }]}>Due</Text>
              <Text style={[styles.tableHeadCell, { flex: 0.7 }]}>End</Text>
            </View>
            {Object.entries(doc.preventive ?? {}).map(([k, item]) => (
              <View key={k} style={styles.tableRow}>
                <Text style={styles.tableCell}>
                  {PREVENTIVE_LABEL[k] ?? k}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.5 }]}>
                  {item.applicable || "—"}
                </Text>
                <Text style={styles.tableCell}>{item.responsible ?? "—"}</Text>
                <Text style={[styles.tableCell, { flex: 0.7 }]}>
                  {item.dueDate ?? "—"}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.7 }]}>
                  {item.endDate ?? "—"}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.row}>
            <Field
              label="Transferred to similar processes"
              value={yesNo(doc.transferredToSimilar)}
              path="transferredToSimilar"
            />
            <Field
              label="Other parts affected"
              value={yesNo(doc.otherPartsAffected)}
              path="otherPartsAffected"
            />
          </View>
          {doc.otherPartsAffected === "yes" ? (
            <Field
              label="Which parts"
              value={doc.otherPartsWhich}
              path="otherPartsWhich"
              wide
            />
          ) : null}
        </Section>

        <Section id="D8" title="Closure">
          <Field
            label="Team appreciation / closing note"
            value={doc.appreciation}
            path="appreciation"
            wide
          />
        </Section>

        <View style={styles.footer} fixed>
          <Text>S³ SixSigmaSense · 8D Report</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );

  return await pdf(PdfDoc).toBlob();
}
