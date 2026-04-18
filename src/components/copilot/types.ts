import type { FieldStatus } from "./eight-d-doc";

export type InitiativeDraft = {
  product_id: string;
  defect_id?: string;
  action_type: "containment" | "corrective" | "preventive" | "investigation";
  owner_user_id: string;
  title: string;
  details: string;
  due_date?: string;
};

export type FieldPatchEvent = {
  type: "update_report_field";
  path: string;
  value: unknown;
  status: FieldStatus;
  source?: string;
  note?: string;
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
        | FieldPatchEvent;
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
