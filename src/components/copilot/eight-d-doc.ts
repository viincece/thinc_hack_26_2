/**
 * Structured model of the 8D report that the editor form and the agent
 * both read/write. The agent never edits markdown; it patches *fields* by
 * dot-path via the `update_report_field` tool.
 *
 * Each patchable field has a matching entry in `FieldMetaMap` recording
 * whether the value is grounded in Manex data, merely suggested, or still
 * waiting on the engineer. The UI renders this status next to every input.
 */

export type FieldStatus = "empty" | "filled" | "suggested" | "needs_input";

export type FieldMeta = {
  status: FieldStatus;
  source?: string;
  note?: string;
};

export type FieldMetaMap = Record<string, FieldMeta>;

export type TeamMember = {
  name?: string;
  department?: string;
  contact?: string;
};

export type ContactBlock = {
  complaintNo?: string;
  articleNr?: string;
  articleName?: string;
  drawingIndex?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
};

export type PartLocation = {
  qty?: string;
  conducted?: boolean;
  reference?: string;
};

export const IMMEDIATE_ACTION_KEYS = [
  "production_stop",
  "customer_informed",
  "internal_info",
  "sample_request",
  "warehouse_sort",
  "derogation",
  "sub_supplier_claim",
  "additional_controls",
  "other",
] as const;
export type ImmediateActionKey = (typeof IMMEDIATE_ACTION_KEYS)[number];

export const IMMEDIATE_ACTION_LABELS: Record<ImmediateActionKey, string> = {
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

export type ImmediateAction = {
  enabled?: boolean;
  responsible?: string;
  dueDate?: string;
  description?: string;
  effectiveness?: number;
};

export const SIXM = [
  "Man",
  "Machine",
  "Material",
  "Method",
  "Environment",
  "Measurement",
] as const;
export type SixM = (typeof SIXM)[number];

export type CauseBlock = {
  categories?: SixM[];
  potentialCause?: string;
  whys?: string[];
  rootCauses?: Array<{ text?: string; participation?: number }>;
};

export type PlannedAction = {
  rootCauseNo?: string;
  description?: string;
  responsible?: string;
  date?: string;
};

export type ImplementedAction = {
  rootCauseNo?: string;
  description?: string;
  date?: string;
  effectiveness?: number;
  note?: string;
};

export const PREVENTIVE_KEYS = [
  "work_instruction",
  "spc",
  "control_plan",
  "fmea",
  "preventive_maintenance",
  "other",
] as const;
export type PreventiveKey = (typeof PREVENTIVE_KEYS)[number];

export const PREVENTIVE_LABELS: Record<PreventiveKey, string> = {
  work_instruction: "Work instruction",
  spc: "SPC",
  control_plan: "Control plan",
  fmea: "FMEA",
  preventive_maintenance: "Preventive maintenance",
  other: "Other",
};

export type PreventiveItem = {
  applicable?: "yes" | "no" | "";
  responsible?: string;
  dueDate?: string;
  endDate?: string;
};

export type FailureImage = {
  name: string;
  /** data: URL — used when the engineer uploaded a file from disk. */
  dataUrl?: string;
  /** Public URL (served from /public) — used when picked from the library. */
  url?: string;
  size?: number;
};

export type EightDDoc = {
  // D0
  complaintDate: string;
  reportDate: string;
  customer: ContactBlock;
  supplier: ContactBlock;

  // D1
  champion: TeamMember;
  coordinator: TeamMember;
  team: TeamMember[];

  // D2
  problem: string;
  failureImages: FailureImage[];

  // D3
  suspect: {
    inProduction: PartLocation;
    inWarehouse: PartLocation;
    inTransit: PartLocation;
    atCustomer: PartLocation;
  };
  immediate: Record<ImmediateActionKey, ImmediateAction>;
  firstOkPo: string;
  firstOkDate: string;

  // D4
  occurrence: CauseBlock;
  detection: CauseBlock;

  // D5
  plannedOccurrence: PlannedAction[];
  plannedDetection: PlannedAction[];
  riskOfNewFailure: "" | "yes" | "no";

  // D6
  implementedOccurrence: ImplementedAction[];
  implementedDetection: ImplementedAction[];

  // D7
  preventive: Record<PreventiveKey, PreventiveItem>;
  transferredToSimilar: "" | "yes" | "no";
  otherPartsAffected: "" | "yes" | "no";
  otherPartsWhich: string;

  // D8
  appreciation: string;
};

const emptyCause = (): CauseBlock => ({
  categories: [],
  potentialCause: "",
  whys: ["", "", "", "", ""],
  rootCauses: [
    { text: "", participation: undefined },
    { text: "", participation: undefined },
  ],
});

const emptyPartLoc = (): PartLocation => ({
  qty: "",
  conducted: false,
  reference: "",
});

const emptyImmediate = (): Record<ImmediateActionKey, ImmediateAction> => {
  const out = {} as Record<ImmediateActionKey, ImmediateAction>;
  for (const k of IMMEDIATE_ACTION_KEYS) out[k] = {};
  return out;
};

const emptyPreventive = (): Record<PreventiveKey, PreventiveItem> => {
  const out = {} as Record<PreventiveKey, PreventiveItem>;
  for (const k of PREVENTIVE_KEYS) out[k] = {};
  return out;
};

export function defaultDoc(): EightDDoc {
  const today = new Date().toISOString().slice(0, 10);
  return {
    complaintDate: today,
    reportDate: today,
    customer: {},
    supplier: {},
    champion: {},
    coordinator: {},
    team: [],
    problem: "",
    failureImages: [],
    suspect: {
      inProduction: emptyPartLoc(),
      inWarehouse: emptyPartLoc(),
      inTransit: emptyPartLoc(),
      atCustomer: emptyPartLoc(),
    },
    immediate: emptyImmediate(),
    firstOkPo: "",
    firstOkDate: "",
    occurrence: emptyCause(),
    detection: emptyCause(),
    plannedOccurrence: [
      { rootCauseNo: "1" },
      { rootCauseNo: "2" },
      { rootCauseNo: "3" },
    ],
    plannedDetection: [
      { rootCauseNo: "1" },
      { rootCauseNo: "2" },
      { rootCauseNo: "3" },
    ],
    riskOfNewFailure: "",
    implementedOccurrence: [
      { rootCauseNo: "1" },
      { rootCauseNo: "2" },
      { rootCauseNo: "3" },
    ],
    implementedDetection: [
      { rootCauseNo: "1" },
      { rootCauseNo: "2" },
      { rootCauseNo: "3" },
    ],
    preventive: emptyPreventive(),
    transferredToSimilar: "",
    otherPartsAffected: "",
    otherPartsWhich: "",
    appreciation: "",
  };
}

/* -------------------------------------------------------------- *
 *  Field path registry — the agent can ONLY patch these keys.
 *  Any other path is rejected by the tool and flagged in the UI.
 * -------------------------------------------------------------- */

export const FIELD_PATHS = [
  // D0
  "complaintDate",
  "reportDate",
  "customer.complaintNo",
  "customer.articleNr",
  "customer.articleName",
  "customer.drawingIndex",
  "customer.contactPerson",
  "customer.email",
  "customer.phone",
  "supplier.complaintNo",
  "supplier.articleNr",
  "supplier.articleName",
  "supplier.drawingIndex",
  "supplier.contactPerson",
  "supplier.email",
  "supplier.phone",
  // D1
  "champion",
  "coordinator",
  "team",
  // D2
  "problem",
  "failureImages",
  // D3
  "suspect.inProduction",
  "suspect.inWarehouse",
  "suspect.inTransit",
  "suspect.atCustomer",
  "immediate.production_stop",
  "immediate.customer_informed",
  "immediate.internal_info",
  "immediate.sample_request",
  "immediate.warehouse_sort",
  "immediate.derogation",
  "immediate.sub_supplier_claim",
  "immediate.additional_controls",
  "immediate.other",
  "firstOkPo",
  "firstOkDate",
  // D4
  "occurrence",
  "detection",
  // D5
  "plannedOccurrence",
  "plannedDetection",
  "riskOfNewFailure",
  // D6
  "implementedOccurrence",
  "implementedDetection",
  // D7
  "preventive.work_instruction",
  "preventive.spc",
  "preventive.control_plan",
  "preventive.fmea",
  "preventive.preventive_maintenance",
  "preventive.other",
  "transferredToSimilar",
  "otherPartsAffected",
  "otherPartsWhich",
  // D8
  "appreciation",
] as const;

export type FieldPath = (typeof FIELD_PATHS)[number];

export function isFieldPath(p: string): p is FieldPath {
  return (FIELD_PATHS as readonly string[]).includes(p);
}

/* -------------------------------------------------------------- *
 *  Apply a patch from the agent onto the doc.
 *  Only the listed paths are supported; anything else is a no-op.
 * -------------------------------------------------------------- */

function setByPath<T extends object>(obj: T, path: string, value: unknown): T {
  const parts = path.split(".");
  const next = structuredClone(obj) as Record<string, unknown>;
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const child = cursor[key];
    if (typeof child === "object" && child !== null) {
      cursor[key] = { ...(child as Record<string, unknown>) };
    } else {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
  return next as T;
}

export function applyFieldPatch(
  doc: EightDDoc,
  path: string,
  value: unknown,
): EightDDoc {
  if (!isFieldPath(path)) return doc;
  return setByPath(doc, path, value);
}

/* -------------------------------------------------------------- *
 *  Human-readable labels by section, for display and agent prompt.
 * -------------------------------------------------------------- */

export const SECTIONS = ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"] as const;
export type SectionKey = (typeof SECTIONS)[number];

export const SECTION_TITLES: Record<SectionKey, string> = {
  D0: "Header & statement",
  D1: "Team",
  D2: "Problem description",
  D3: "Immediate containment",
  D4: "Root cause analysis",
  D5: "Planned corrective actions",
  D6: "Implemented corrective actions",
  D7: "Preventive actions",
  D8: "Closure & recognition",
};

export const SECTION_HINT: Record<SectionKey, string> = {
  D0: "Who filed the complaint and which article is affected.",
  D1: "Champion, coordinator, and supporting team members.",
  D2: "What the failure is, with pictures if available.",
  D3: "Stop-the-bleed actions taken right now.",
  D4: "5-why analysis for occurrence and for non-detection.",
  D5: "Corrective actions the supplier plans to run.",
  D6: "What has actually been implemented and how effective it is.",
  D7: "Updates to SOPs / FMEA / control plan to prevent recurrence.",
  D8: "Team appreciation and sign-off.",
};

/** Full explanations shown as a tooltip when the engineer hovers the info
 * icon. Kept to a few concise sentences — meant to unblock a new user,
 * not teach them 8D theory. */
export const SECTION_INFO: Record<SectionKey, string> = {
  D0: "Header & statement. Identify the complaint: dates, article / drawing index, and contact on both sides. These anchor the whole report and must match the complaint email.",
  D1: "Team. A 'champion' sponsors the 8D (often the quality manager). A 'coordinator' runs it day to day. Team members contribute expertise from production, engineering, supplier side, etc.",
  D2: "Problem description. Facts only — what failed, where, when, how often, with pictures if available. Keep it short; analysis belongs in D4.",
  D3: "Immediate containment. Actions you take TODAY to stop the defect reaching more customers: production stop, sorting, derogation. Fill in the quantities of suspect parts at each location.",
  D4: "Root cause analysis. Two separate 5-why chains: why the failure OCCURRED, and why it was NOT DETECTED. Tag each chain with its 6M category (Man / Machine / Material / Method / Environment / Measurement).",
  D5: "Planned corrective actions. What you will do to remove each root cause. One row per cause; include responsible owner and planned due date.",
  D6: "Implemented corrective actions. Evidence the planned actions actually ran, with effectiveness % measured post-implementation.",
  D7: "Preventive actions. Update SOPs, SPC, control plan, FMEA and preventive maintenance so the same failure mode can't return. Flag if other parts/processes are affected.",
  D8: "Closure. Recognize the team's work and sign off. Once signed, nothing in this draft should change.",
};

/* Which field paths belong to which section — used to compute
 * per-section progress rings. */
export const SECTION_FIELDS: Record<SectionKey, readonly FieldPath[]> = {
  D0: [
    "complaintDate",
    "reportDate",
    "customer.complaintNo",
    "customer.articleNr",
    "customer.articleName",
    "customer.drawingIndex",
    "customer.contactPerson",
    "customer.email",
    "customer.phone",
    "supplier.complaintNo",
    "supplier.articleNr",
    "supplier.articleName",
    "supplier.drawingIndex",
    "supplier.contactPerson",
    "supplier.email",
    "supplier.phone",
  ],
  D1: ["champion", "coordinator", "team"],
  D2: ["problem", "failureImages"],
  D3: [
    "suspect.inProduction",
    "suspect.inWarehouse",
    "suspect.inTransit",
    "suspect.atCustomer",
    "immediate.production_stop",
    "immediate.customer_informed",
    "immediate.internal_info",
    "immediate.sample_request",
    "immediate.warehouse_sort",
    "immediate.derogation",
    "immediate.sub_supplier_claim",
    "immediate.additional_controls",
    "immediate.other",
    "firstOkPo",
    "firstOkDate",
  ],
  D4: ["occurrence", "detection"],
  D5: ["plannedOccurrence", "plannedDetection", "riskOfNewFailure"],
  D6: ["implementedOccurrence", "implementedDetection"],
  D7: [
    "preventive.work_instruction",
    "preventive.spc",
    "preventive.control_plan",
    "preventive.fmea",
    "preventive.preventive_maintenance",
    "preventive.other",
    "transferredToSimilar",
    "otherPartsAffected",
    "otherPartsWhich",
  ],
  D8: ["appreciation"],
};
