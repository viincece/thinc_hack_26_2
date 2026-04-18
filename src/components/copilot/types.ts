export const SECTIONS = [
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
  "D8",
] as const;

export type Section = (typeof SECTIONS)[number];

export const SECTION_TITLES: Record<Section, string> = {
  D1: "Team",
  D2: "Problem description",
  D3: "Interim containment",
  D4: "Root cause analysis",
  D5: "Corrective actions",
  D6: "Verify effectiveness",
  D7: "Prevent recurrence",
  D8: "Closure & recognition",
};

export type InitiativeDraft = {
  product_id: string;
  defect_id?: string;
  action_type: "containment" | "corrective" | "preventive" | "investigation";
  owner_user_id: string;
  title: string;
  details: string;
  due_date?: string;
};

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "text_done" }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
      purpose?: string;
    }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | {
      type: "ui";
      event:
        | { type: "propose_initiative"; payload: InitiativeDraft }
        | { type: "update_report_section"; section: string; markdown: string };
    }
  | { type: "error"; message: string }
  | { type: "done" };

export type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    purpose?: string;
    summary?: string;
    ok?: boolean;
  }>;
};
