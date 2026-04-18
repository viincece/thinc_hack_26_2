/**
 * Shape of a generated incident-analysis report.
 *
 * Serialised to `/public/reports/<id>.json` — the page that displays a
 * report reads this file and renders deterministically (no extra DB /
 * KG queries), so the saved artefact is stable even if upstream data
 * changes later.
 */

export type FaultNodeKind = "defect" | "category" | "concept" | "evidence";

export type FaultNode = {
  id: string;
  kind: FaultNodeKind;
  label: string;
  detail?: string;
  confidence?: "high" | "medium" | "low";
  children?: FaultNode[];
};

export type BomTreeNode = {
  id: string;                 // bom_node_id
  label: string;              // find_number + part title
  part_number?: string;
  find_number?: string;
  supplier_batch_id?: string;
  supplier_name?: string;
  defects_count?: number;
  highlight?: "root_cause" | "watch" | null;
  children?: BomTreeNode[];
};

export type SimilarIncident = {
  defect_id: string;
  ts: string;
  defect_code: string;
  severity: string;
};

export type OpenInitiative = {
  action_id: string;
  action_type: string;
  status: string;
  comments: string;
};

export type PreventionStep = {
  title: string;
  detail: string;
  owner?: string;
};

export type ReportFacts = {
  defect_id?: string;
  defect_code?: string;
  severity?: string;
  article_id?: string;
  article_name?: string;
  product_id?: string;
  reported_part_number?: string;
  reported_part_title?: string;
  supplier_batch_id?: string;
  supplier_name?: string;
  occurrence_section_name?: string | null;
  detected_section_name?: string | null;
  cost_eur?: number | null;
  ts?: string;
  notes?: string;
  similar_count: number;
  field_claims_count: number;
  rework_text?: string;
  rework_user?: string;
};

export type RiskBand = "low" | "medium" | "high" | "critical";

export type RiskScore = {
  value: number;              // 0-100
  band: RiskBand;
  rationale: string[];
};

export type CostScore = {
  defectCostEur: number;
  reworkCostEur: number;
  claimCostEur: number;
  totalEur: number;
  rationale: string[];
};

export type ResolutionStats = {
  sampleSize: number;
  meanDaysToClose: number | null;
  medianDaysToClose: number | null;
  // Action-type frequency among closed initiatives for this defect code.
  actionTypes: Array<{ type: string; count: number }>;
  // Top free-text corrective actions (first line of `comments`).
  topActions: Array<{ text: string; count: number }>;
};

export type CostTimelineBucket = {
  weekStart: string;          // YYYY-MM-DD (Monday of ISO week)
  defectEur: number;
  claimEur: number;
};

export type TimelineEventKind =
  | "build"
  | "defect"
  | "rework"
  | "claim"
  | "action";

export type TimelineEvent = {
  ts: string;                 // ISO
  kind: TimelineEventKind;
  id: string;
  label: string;
  severity?: string;
};

export type IncidentReport = {
  id: string;                // IR-YYMMDD-XXXX
  name: string;
  generatedAt: string;
  source: {
    draftId: string;
    draftName: string;
    defect_id?: string;
  };
  facts: ReportFacts;
  risk: RiskScore;
  cost: CostScore;
  faultTree: FaultNode;
  bomTree: BomTreeNode | null;
  timeline: TimelineEvent[];
  costTimeline: CostTimelineBucket[];
  resolution: ResolutionStats;
  prevention: {
    summary: string;
    steps: PreventionStep[];
    similarIncidents: SimilarIncident[];
    openInitiatives: OpenInitiative[];
  };
};

export type ReportSummary = {
  id: string;
  name: string;
  generatedAt: string;
  sourceDraftId: string;
  articleName?: string;
  defectCode?: string;
  filename: string;
  sizeBytes: number;
};
