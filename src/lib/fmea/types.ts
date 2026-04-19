/**
 * FMEA types. Column set mirrors the German DIN/AIAG grid in
 * docs/FMEA_Template.xlsx:
 *
 *   Element / Funktion
 *   Möglicher Fehler / Fehlfunktion
 *   Mögliche Fehlerfolgen
 *   Bedeutung (S)           ← Severity
 *   Mögliche Fehlerursachen
 *   Auftreten (O)           ← Occurrence
 *   Vermeidungsmaßnahmen    ← Prevention controls
 *   Entdeckungsmaßnahmen    ← Detection controls
 *   Entdeckung (D)          ← Detection
 *   RPZ                     ← RPN = S × O × D (computed)
 *   Empfohlene Abstell-Ma.  ← Recommended actions
 *   Verantwortlichkeit / Termin
 *   Getroffene Maßnahmen    ← Actions taken
 *
 * Status chip taxonomy matches the rest of the app (8D, QM reports,
 * incident analyses) so the UX is consistent: grounded / suggested /
 * needs_input.
 */

export type FmeaStatus = "grounded" | "suggested" | "needs_input";

export type FmeaCell<T = string> = {
  value: T | null;
  status: FmeaStatus;
  /** Row/observation IDs supporting the value (comma-separated). */
  source?: string;
  /** Used when status is `needs_input`: what the engineer must gather. */
  note?: string;
};

export type FmeaKind = "Design" | "Process";

export type FmeaRow = {
  id: string;                     // stable row id; bom_node id or synthetic
  elementFunction: FmeaCell<string>;
  failureMode: FmeaCell<string>;
  effects: FmeaCell<string>;
  severity: FmeaCell<number>;     // AIAG 1–10
  causes: FmeaCell<string>;
  occurrence: FmeaCell<number>;   // AIAG 1–10
  prevention: FmeaCell<string>;
  detection: FmeaCell<string>;
  detectionScore: FmeaCell<number>; // AIAG 1–10
  /** Computed server-side as S × O × D — not an LLM output. */
  rpn: number;
  recommendedActions: FmeaCell<string>;
  responsibility: FmeaCell<string>;
  dueDate: FmeaCell<string>;       // YYYY-MM-DD
  actionsTaken: FmeaCell<string>;
  /** Reference to the underlying BOM node / part, for drill-down. */
  bomNodeId?: string;
  partNumber?: string;
  findNumber?: string;
};

export type FmeaHeader = {
  kind: FmeaKind;
  modelSystem: string;              // Modell/System/Fertigung
  productName: string;
  productNumber: string;
  revision: string;                 // Techn. Änderungsstand
  createdBy: string;                // Erstellt durch (Name/Abt.)
  revisedBy: string;                // Überarbeitet
  createdAt: string;                // Erstellt (date)
  effortHours: number | null;       // Aufwand (in h)
  responsible: string;              // Verantwortlich
};

export type FmeaDoc = {
  id: string;
  name: string;
  generatedAt: string;
  source: {
    articleId: string;
    articleName?: string;
    bomId?: string;
  };
  header: FmeaHeader;
  rows: FmeaRow[];
};

export type ArticleSummary = {
  article_id: string;
  article_name: string | null;
  commodity?: string | null;
  bomSize: number;
  defects6mo: number;
  criticalDefects6mo: number;
  lastDefectAt: string | null;
};
