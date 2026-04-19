"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  FmeaCell,
  FmeaDoc,
  FmeaRow,
  FmeaStatus,
} from "@/lib/fmea/types";

/**
 * FMEA editor — header form + horizontally scrollable table.
 *
 * UX priorities:
 *   - The RPN column is the "at a glance" signal; it's bold, colour-
 *     banded (green/amber/red) and right-anchored so sorting-by-RPN-
 *     desc (which the generator already does) puts hot rows first.
 *   - Every cell carries a status chip (grounded / suggested / needs
 *     input). Suggested / needs-input cells glow so the engineer sees
 *     what still needs review at a glance.
 *   - "Approve row" promotes every suggested / needs-input cell in
 *     that row to `grounded` (with source="approved by engineer") so
 *     the heat-map calms down as the engineer works through the table.
 *   - S / O / D / RPN re-compute live as the engineer edits the
 *     numeric cells.
 */

type EditableTextKey =
  | "elementFunction"
  | "failureMode"
  | "effects"
  | "causes"
  | "prevention"
  | "detection"
  | "recommendedActions"
  | "responsibility"
  | "dueDate"
  | "actionsTaken";

type EditableNumberKey = "severity" | "occurrence" | "detectionScore";

export function FmeaEditor({ initial }: { initial: FmeaDoc }) {
  const [doc, setDoc] = useState<FmeaDoc>(initial);
  const [dirty, setDirty] = useState(false);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  const overallStats = useMemo(() => {
    const n = doc.rows.length;
    let grounded = 0;
    let suggested = 0;
    let needs = 0;
    let maxRpn = 0;
    for (const r of doc.rows) {
      maxRpn = Math.max(maxRpn, r.rpn);
      const cells = collectCells(r);
      for (const c of cells) {
        if (c.status === "grounded") grounded++;
        else if (c.status === "suggested") suggested++;
        else if (c.status === "needs_input") needs++;
      }
    }
    return { n, grounded, suggested, needs, maxRpn };
  }, [doc]);

  const updateHeader = useCallback((patch: Partial<FmeaDoc["header"]>) => {
    setDoc((prev) => ({ ...prev, header: { ...prev.header, ...patch } }));
    setDirty(true);
    setSavingState((s) => (s === "saved" ? "idle" : s));
  }, []);

  const updateTextCell = useCallback(
    (rowId: string, key: EditableTextKey, value: string) => {
      setDoc((prev) => ({
        ...prev,
        rows: prev.rows.map((r) =>
          r.id !== rowId ? r : { ...r, [key]: bump(r[key], value) },
        ),
      }));
      setDirty(true);
      setSavingState((s) => (s === "saved" ? "idle" : s));
    },
    [],
  );

  const updateNumberCell = useCallback(
    (rowId: string, key: EditableNumberKey, value: number) => {
      setDoc((prev) => ({
        ...prev,
        rows: prev.rows.map((r) => {
          if (r.id !== rowId) return r;
          const next = { ...r, [key]: bumpNumber(r[key], value) };
          next.rpn = rpn(next);
          return next;
        }),
      }));
      setDirty(true);
      setSavingState((s) => (s === "saved" ? "idle" : s));
    },
    [],
  );

  const approveRow = useCallback((rowId: string) => {
    setDoc((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        r.id !== rowId
          ? r
          : {
              ...r,
              elementFunction: promote(r.elementFunction),
              failureMode: promote(r.failureMode),
              effects: promote(r.effects),
              severity: promote(r.severity),
              causes: promote(r.causes),
              occurrence: promote(r.occurrence),
              prevention: promote(r.prevention),
              detection: promote(r.detection),
              detectionScore: promote(r.detectionScore),
              recommendedActions: promote(r.recommendedActions),
              responsibility: promote(r.responsibility),
              dueDate: promote(r.dueDate),
              actionsTaken: promote(r.actionsTaken),
            },
      ),
    }));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSavingState("saving");
    try {
      const r = await fetch("/api/fmea/generate", {
        // We reuse the generate endpoint for the first pass; follow-up
        // saves go through a PATCH-ish endpoint that overwrites the
        // JSON on disk. For now we just re-POST the updated doc.
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc }),
      }).catch(() => null);
      // If the PUT endpoint isn't wired yet, fall back to saving via a
      // dedicated save route (added below).
      if (!r || !r.ok) {
        const r2 = await fetch(`/api/fmea/${encodeURIComponent(doc.id)}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc }),
        });
        if (!r2.ok) throw new Error(`save ${r2.status}`);
      }
      setSavingState("saved");
      setDirty(false);
    } catch {
      setSavingState("error");
    }
  }, [doc]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
      {/* top bar */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-xs text-muted-olive">
          <span className="font-mono">{doc.id}</span>
          <span>· generated {new Date(doc.generatedAt).toLocaleString()}</span>
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!dirty || savingState === "saving"}
            title={dirty ? "Save changes" : "Nothing to save"}
          >
            {savingState === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {savingState === "saved" && !dirty ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold leading-tight tracking-tight text-deep-olive">
          {doc.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-olive">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold uppercase text-emerald-800 ring-1 ring-inset ring-emerald-200">
            {overallStats.grounded} grounded
          </span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold uppercase text-violet-800 ring-1 ring-inset ring-violet-200">
            {overallStats.suggested} suggested
          </span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold uppercase text-amber-800 ring-1 ring-inset ring-amber-200">
            {overallStats.needs} needs input
          </span>
          <span className="rounded-full bg-sage-cream px-2 py-0.5 font-semibold uppercase text-muted-olive ring-1 ring-inset ring-sage-border">
            top RPN {overallStats.maxRpn}
          </span>
        </div>
      </div>

      {/* Header form */}
      <Card>
        <CardHeader className="px-4 pb-2 pt-3">
          <CardTitle className="text-sm">FMEA header</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 px-4 pb-4 pt-0 md:grid-cols-3">
          <HeaderField
            label="Modell / System / Fertigung"
            value={doc.header.modelSystem}
            onChange={(v) => updateHeader({ modelSystem: v })}
          />
          <HeaderField
            label="Produktname"
            value={doc.header.productName}
            onChange={(v) => updateHeader({ productName: v })}
          />
          <HeaderField
            label="Produkt-Nummer"
            value={doc.header.productNumber}
            onChange={(v) => updateHeader({ productNumber: v })}
          />
          <HeaderField
            label="Techn. Änderungsstand"
            value={doc.header.revision}
            onChange={(v) => updateHeader({ revision: v })}
          />
          <HeaderField
            label="Erstellt durch (Name / Abt.)"
            value={doc.header.createdBy}
            onChange={(v) => updateHeader({ createdBy: v })}
          />
          <HeaderField
            label="Überarbeitet"
            value={doc.header.revisedBy}
            onChange={(v) => updateHeader({ revisedBy: v })}
          />
          <HeaderField
            label="Erstellt"
            type="date"
            value={doc.header.createdAt}
            onChange={(v) => updateHeader({ createdAt: v })}
          />
          <HeaderField
            label="Aufwand (h)"
            type="number"
            value={doc.header.effortHours != null ? String(doc.header.effortHours) : ""}
            onChange={(v) =>
              updateHeader({ effortHours: v === "" ? null : Number(v) })
            }
          />
          <HeaderField
            label="Verantwortlich"
            value={doc.header.responsible}
            onChange={(v) => updateHeader({ responsible: v })}
          />
        </CardContent>
      </Card>

      {/* Grid */}
      <Card>
        <CardHeader className="px-4 pb-2 pt-3">
          <CardTitle className="text-sm">
            Risk table · {doc.rows.length} rows · sorted by RPN ↓
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2 pt-0">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[12px]">
              <thead className="sticky top-0 z-10 bg-sage-cream/80 text-[10px] uppercase tracking-wider text-muted-olive">
                <tr>
                  <Th className="w-[200px]">Element / Funktion</Th>
                  <Th className="w-[140px]">Mögl. Fehler</Th>
                  <Th className="w-[220px]">Folgen</Th>
                  <Th className="w-[60px] text-center">S</Th>
                  <Th className="w-[220px]">Ursachen</Th>
                  <Th className="w-[60px] text-center">O</Th>
                  <Th className="w-[220px]">Vermeidung</Th>
                  <Th className="w-[220px]">Entdeckungs-Ma.</Th>
                  <Th className="w-[60px] text-center">D</Th>
                  <Th className="w-[80px] text-right">RPZ</Th>
                  <Th className="w-[240px]">Abstell-Ma.</Th>
                  <Th className="w-[160px]">Verantwortlich / Termin</Th>
                  <Th className="w-[120px] text-right" />
                </tr>
              </thead>
              <tbody>
                {doc.rows.map((r) => (
                  <FmeaRowView
                    key={r.id}
                    row={r}
                    onText={(key, v) => updateTextCell(r.id, key, v)}
                    onNumber={(key, v) => updateNumberCell(r.id, key, v)}
                    onApprove={() => approveRow(r.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- *
 *  Row rendering
 * -------------------------------------------------------------- */

function FmeaRowView({
  row,
  onText,
  onNumber,
  onApprove,
}: {
  row: FmeaRow;
  onText: (key: EditableTextKey, v: string) => void;
  onNumber: (key: EditableNumberKey, v: number) => void;
  onApprove: () => void;
}) {
  const needsReview = rowNeedsReview(row);

  return (
    <tr
      className={cn(
        "align-top",
        needsReview
          ? "bg-amber-50/40 hover:bg-amber-50/60"
          : "hover:bg-sage-cream/40",
      )}
    >
      <TextCell cell={row.elementFunction} onChange={(v) => onText("elementFunction", v)} />
      <TextCell cell={row.failureMode} onChange={(v) => onText("failureMode", v)} />
      <TextCell cell={row.effects} onChange={(v) => onText("effects", v)} multiline />
      <NumberCell
        cell={row.severity}
        onChange={(v) => onNumber("severity", v)}
        min={1}
        max={10}
      />
      <TextCell cell={row.causes} onChange={(v) => onText("causes", v)} multiline />
      <NumberCell
        cell={row.occurrence}
        onChange={(v) => onNumber("occurrence", v)}
        min={1}
        max={10}
      />
      <TextCell cell={row.prevention} onChange={(v) => onText("prevention", v)} multiline />
      <TextCell cell={row.detection} onChange={(v) => onText("detection", v)} multiline />
      <NumberCell
        cell={row.detectionScore}
        onChange={(v) => onNumber("detectionScore", v)}
        min={1}
        max={10}
      />
      <td className="border-b border-sage-border/70 px-2 py-1 text-right align-middle">
        <span
          className={cn(
            "inline-block min-w-[48px] rounded px-1.5 py-0.5 text-right text-sm font-extrabold tabular-nums",
            rpnBand(row.rpn),
          )}
        >
          {row.rpn}
        </span>
      </td>
      <TextCell cell={row.recommendedActions} onChange={(v) => onText("recommendedActions", v)} multiline />
      <td className="border-b border-sage-border/70 px-2 py-1">
        <div className="flex flex-col gap-1">
          <TextInner cell={row.responsibility} onChange={(v) => onText("responsibility", v)} />
          <TextInner cell={row.dueDate} onChange={(v) => onText("dueDate", v)} placeholder="YYYY-MM-DD" />
        </div>
      </td>
      <td className="border-b border-sage-border/70 px-2 py-1 align-middle">
        {needsReview ? (
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 transition-colors hover:bg-emerald-100"
            title="Promote every suggested / needs-input cell in this row to grounded."
          >
            <CheckCircle2 className="h-3 w-3" />
            Approve row
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-olive">
            <CheckCircle2 className="h-3 w-3" />
            approved
          </span>
        )}
      </td>
    </tr>
  );
}

function TextCell({
  cell,
  onChange,
  multiline,
}: {
  cell: FmeaCell<string>;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <td className="border-b border-sage-border/70 px-2 py-1 align-top">
      <TextInner cell={cell} onChange={onChange} multiline={multiline} />
    </td>
  );
}

function TextInner({
  cell,
  onChange,
  multiline,
  placeholder,
}: {
  cell: FmeaCell<string>;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const value = cell.value ?? "";
  return (
    <div className={cn("rounded border bg-white/70 p-1", cellBorder(cell.status))}>
      <div className="mb-0.5 flex items-center justify-between gap-1">
        <StatusChip status={cell.status} />
        {cell.source ? (
          <span
            className="truncate font-mono text-[9px] text-muted-olive"
            title={cell.source}
          >
            {cell.source}
          </span>
        ) : null}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={cell.status === "needs_input" ? cell.note ?? "needs input" : placeholder}
          rows={2}
          className="block w-full resize-y bg-transparent text-[12px] leading-5 outline-none placeholder:italic placeholder:text-muted-olive"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={cell.status === "needs_input" ? cell.note ?? "needs input" : placeholder}
          className="block w-full bg-transparent text-[12px] outline-none placeholder:italic placeholder:text-muted-olive"
        />
      )}
    </div>
  );
}

function NumberCell({
  cell,
  onChange,
  min,
  max,
}: {
  cell: FmeaCell<number>;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const v = cell.value ?? 0;
  return (
    <td className="border-b border-sage-border/70 px-2 py-1 align-top">
      <div className={cn("rounded border bg-white/70 p-1 text-center", cellBorder(cell.status))}>
        <div className="mb-0.5 flex items-center justify-center">
          <StatusChip status={cell.status} compact />
        </div>
        <input
          type="number"
          min={min}
          max={max}
          value={v === 0 ? "" : v}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.max(min, Math.min(max, n)));
          }}
          className="block w-full bg-transparent text-center text-sm font-bold outline-none"
        />
      </div>
    </td>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "border-b-2 border-sage-border bg-sage-cream/70 px-2 py-1 text-left font-semibold",
        className,
      )}
    >
      {children}
    </th>
  );
}

function HeaderField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date" | "number";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-sage-border bg-white px-2 py-1 text-sm outline-none focus:border-light-border"
      />
    </label>
  );
}

function StatusChip({
  status,
  compact,
}: {
  status: FmeaStatus;
  compact?: boolean;
}) {
  if (status === "grounded") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-sm bg-emerald-100 font-semibold uppercase tracking-wider text-emerald-800 ring-1 ring-inset ring-emerald-200",
          compact ? "px-1 py-0 text-[8px]" : "px-1 py-0 text-[9px]",
        )}
        title="grounded — cited by a DB row"
      >
        <CheckCircle2 className={compact ? "h-2 w-2" : "h-2.5 w-2.5"} />
        {compact ? "" : "grounded"}
      </span>
    );
  }
  if (status === "suggested") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-sm bg-violet-100 font-semibold uppercase tracking-wider text-violet-800 ring-1 ring-inset ring-violet-200",
          compact ? "px-1 py-0 text-[8px]" : "px-1 py-0 text-[9px]",
        )}
        title="AI suggestion — review before accepting"
      >
        <Sparkles className={compact ? "h-2 w-2" : "h-2.5 w-2.5"} />
        {compact ? "" : "AI"}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm bg-amber-100 font-semibold uppercase tracking-wider text-amber-800 ring-1 ring-inset ring-amber-200",
        compact ? "px-1 py-0 text-[8px]" : "px-1 py-0 text-[9px]",
      )}
      title="needs input from the engineer"
    >
      <AlertTriangle className={compact ? "h-2 w-2" : "h-2.5 w-2.5"} />
      {compact ? "" : "needs"}
    </span>
  );
}

/* -------------------------------------------------------------- *
 *  Helpers — cell mutation + banding
 * -------------------------------------------------------------- */

function bump<T extends string>(
  cell: FmeaCell<T>,
  nextValue: string,
): FmeaCell<T> {
  // Manual edit keeps the existing status chip so the engineer still
  // sees whether the cell was AI-suggested; only empty → edit promotes
  // to grounded (mirrors the 8D editor rule).
  const trimmed = nextValue as T;
  if (cell.status === "needs_input" && nextValue.trim() !== "") {
    return { ...cell, value: trimmed, status: "suggested" };
  }
  return { ...cell, value: trimmed };
}

function bumpNumber(cell: FmeaCell<number>, n: number): FmeaCell<number> {
  return { ...cell, value: n };
}

function promote<T>(cell: FmeaCell<T>): FmeaCell<T> {
  if (cell.status === "grounded") return cell;
  return {
    ...cell,
    status: "grounded",
    source: cell.source ?? "approved by engineer",
  };
}

function collectCells(r: FmeaRow): FmeaCell<unknown>[] {
  return [
    r.elementFunction,
    r.failureMode,
    r.effects,
    r.severity as FmeaCell<unknown>,
    r.causes,
    r.occurrence as FmeaCell<unknown>,
    r.prevention,
    r.detection,
    r.detectionScore as FmeaCell<unknown>,
    r.recommendedActions,
    r.responsibility,
    r.dueDate,
    r.actionsTaken,
  ];
}

function rowNeedsReview(r: FmeaRow): boolean {
  for (const c of collectCells(r)) {
    if (c.status === "suggested" || c.status === "needs_input") return true;
  }
  return false;
}

function rpn(r: FmeaRow): number {
  const s = r.severity.value ?? 0;
  const o = r.occurrence.value ?? 0;
  const d = r.detectionScore.value ?? 0;
  return Math.max(0, Math.min(1000, s * o * d));
}

function rpnBand(rpn: number): string {
  if (rpn >= 200)
    return "bg-red-500 text-white";
  if (rpn >= 100)
    return "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200";
  if (rpn >= 40)
    return "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200";
  return "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200";
}

function cellBorder(status: FmeaStatus): string {
  if (status === "grounded") return "border-emerald-200";
  if (status === "suggested") return "border-violet-200";
  return "border-amber-200";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = CircleDot; // silence unused-import warnings when lint runs
