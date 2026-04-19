"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
 * FMEA editor — row-as-card layout.
 *
 * Why: the classic AIAG grid has 13 columns, which means horizontal
 * scrolling and cramped cells on any reasonable viewport. Each row is
 * really a small document — *one failure mode for one component* — so
 * rendering it as a stacked, expandable card reads much better than
 * squashing 13 columns on one line.
 *
 * Collapsed row shows the five things the engineer scans for:
 *   - element / function
 *   - failure mode
 *   - S · O · D pill chips
 *   - RPN badge (colour-banded)
 *   - "approve row" button when any cell is still suggested / needs input
 *
 * Expanded panel is a 2-column responsive grid. Every field has a full
 * label and a wide input so values are always visible.
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

type FilterMode = "all" | "needs_review" | "approved";

export function FmeaEditor({ initial }: { initial: FmeaDoc }) {
  const [doc, setDoc] = useState<FmeaDoc>(initial);
  const [dirty, setDirty] = useState(false);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [filter, setFilter] = useState<FilterMode>("all");

  // Rows auto-start expanded if their RPN is ≥ 100 — these are the
  // ones that deserve the engineer's attention on page open.
  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    for (const r of doc.rows) if (r.rpn >= 100) set.add(r.id);
    return set;
  }, [doc.rows]);
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  const toggleRow = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expandAll = () =>
    setExpanded(new Set(doc.rows.map((r) => r.id)));
  const collapseAll = () => setExpanded(new Set());

  const stats = useMemo(() => {
    const n = doc.rows.length;
    let grounded = 0;
    let suggested = 0;
    let needs = 0;
    let maxRpn = 0;
    let reviewRows = 0;
    let approvedRows = 0;
    for (const r of doc.rows) {
      maxRpn = Math.max(maxRpn, r.rpn);
      const needsRow = rowNeedsReview(r);
      if (needsRow) reviewRows++;
      else approvedRows++;
      for (const c of collectCells(r)) {
        if (c.status === "grounded") grounded++;
        else if (c.status === "suggested") suggested++;
        else if (c.status === "needs_input") needs++;
      }
    }
    return { n, grounded, suggested, needs, maxRpn, reviewRows, approvedRows };
  }, [doc]);

  const visibleRows = useMemo(() => {
    if (filter === "all") return doc.rows;
    if (filter === "needs_review") return doc.rows.filter(rowNeedsReview);
    return doc.rows.filter((r) => !rowNeedsReview(r));
  }, [doc.rows, filter]);

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
      const r = await fetch(`/api/fmea/${encodeURIComponent(doc.id)}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc }),
      });
      if (!r.ok) throw new Error(`save ${r.status}`);
      setSavingState("saved");
      setDirty(false);
      // Let the workspace rails refresh in case name / max RPN changed.
      window.dispatchEvent(new Event("s3:workspace-changed"));
    } catch {
      setSavingState("error");
    }
  }, [doc]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
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
            {stats.grounded} grounded
          </span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold uppercase text-violet-800 ring-1 ring-inset ring-violet-200">
            {stats.suggested} suggested
          </span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold uppercase text-amber-800 ring-1 ring-inset ring-amber-200">
            {stats.needs} needs input
          </span>
          <span className="rounded-full bg-sage-cream px-2 py-0.5 font-semibold uppercase text-muted-olive ring-1 ring-inset ring-sage-border">
            top RPN {stats.maxRpn}
          </span>
        </div>
      </div>

      {/* Header form — all English */}
      <Card>
        <CardHeader className="px-4 pb-2 pt-3">
          <CardTitle className="text-sm">FMEA header</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 px-4 pb-4 pt-0 md:grid-cols-3">
          <HeaderField
            label="Model / system / production"
            value={doc.header.modelSystem}
            onChange={(v) => updateHeader({ modelSystem: v })}
          />
          <HeaderField
            label="Product name"
            value={doc.header.productName}
            onChange={(v) => updateHeader({ productName: v })}
          />
          <HeaderField
            label="Product number"
            value={doc.header.productNumber}
            onChange={(v) => updateHeader({ productNumber: v })}
          />
          <HeaderField
            label="Technical revision"
            value={doc.header.revision}
            onChange={(v) => updateHeader({ revision: v })}
          />
          <HeaderField
            label="Created by (name / dept)"
            value={doc.header.createdBy}
            onChange={(v) => updateHeader({ createdBy: v })}
          />
          <HeaderField
            label="Revised by"
            value={doc.header.revisedBy}
            onChange={(v) => updateHeader({ revisedBy: v })}
          />
          <HeaderField
            label="Created"
            type="date"
            value={doc.header.createdAt}
            onChange={(v) => updateHeader({ createdAt: v })}
          />
          <HeaderField
            label="Effort (hours)"
            type="number"
            value={doc.header.effortHours != null ? String(doc.header.effortHours) : ""}
            onChange={(v) =>
              updateHeader({ effortHours: v === "" ? null : Number(v) })
            }
          />
          <HeaderField
            label="Responsible"
            value={doc.header.responsible}
            onChange={(v) => updateHeader({ responsible: v })}
          />
        </CardContent>
      </Card>

      {/* Risk analysis */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 pb-2 pt-3">
          <CardTitle className="text-sm">
            Risk analysis · {doc.rows.length} rows · sorted by RPN ↓
          </CardTitle>
          <div className="flex items-center gap-2">
            <FilterSegment
              value={filter}
              onChange={setFilter}
              stats={stats}
            />
            <button
              type="button"
              onClick={expandAll}
              className="text-[10px] font-semibold uppercase tracking-wider text-muted-olive hover:text-brand-orange"
              title="Expand every row"
            >
              expand all
            </button>
            <span className="text-[10px] text-muted-olive">·</span>
            <button
              type="button"
              onClick={collapseAll}
              className="text-[10px] font-semibold uppercase tracking-wider text-muted-olive hover:text-brand-orange"
              title="Collapse every row"
            >
              collapse all
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 px-3 pb-3 pt-0">
          {visibleRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-sage-border p-6 text-center text-[12px] italic text-muted-olive">
              No rows match the current filter.
            </div>
          ) : (
            visibleRows.map((row) => (
              <RiskRowCard
                key={row.id}
                row={row}
                expanded={expanded.has(row.id)}
                onToggle={() => toggleRow(row.id)}
                onText={(k, v) => updateTextCell(row.id, k, v)}
                onNumber={(k, v) => updateNumberCell(row.id, k, v)}
                onApprove={() => approveRow(row.id)}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- *
 *  Row card
 * -------------------------------------------------------------- */

function RiskRowCard({
  row,
  expanded,
  onToggle,
  onText,
  onNumber,
  onApprove,
}: {
  row: FmeaRow;
  expanded: boolean;
  onToggle: () => void;
  onText: (k: EditableTextKey, v: string) => void;
  onNumber: (k: EditableNumberKey, v: number) => void;
  onApprove: () => void;
}) {
  const needsReview = rowNeedsReview(row);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border",
        needsReview
          ? "border-amber-200 bg-amber-50/30"
          : "border-sage-border bg-parchment",
      )}
    >
      {/* Collapsed header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-sage-cream/30"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-olive" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-olive" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-deep-olive">
              {row.elementFunction.value ?? "(no element)"}
            </span>
            {row.partNumber ? (
              <span className="shrink-0 rounded bg-sage-cream px-1 font-mono text-[10px] text-muted-olive ring-1 ring-inset ring-sage-border">
                {row.partNumber}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-olive">
            <span className="font-medium text-olive-ink">
              Failure mode:{" "}
              <span className="font-mono">
                {row.failureMode.value ?? "—"}
              </span>
            </span>
            {row.failureMode.source ? (
              <span className="font-mono text-[10px]">
                · {row.failureMode.source}
              </span>
            ) : null}
          </div>
        </div>

        {/* Scores — always visible, comfortably sized */}
        <div className="hidden items-center gap-1 sm:flex">
          <ScorePill label="S" value={row.severity.value} status={row.severity.status} />
          <ScorePill label="O" value={row.occurrence.value} status={row.occurrence.status} />
          <ScorePill label="D" value={row.detectionScore.value} status={row.detectionScore.status} />
        </div>
        <RpnBadge value={row.rpn} />
        {needsReview ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
            className="inline-flex cursor-pointer shrink-0 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 transition-colors hover:bg-emerald-100"
            title="Promote every suggested / needs-input cell in this row to grounded"
          >
            <CheckCircle2 className="h-3 w-3" />
            Approve
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-olive">
            <CheckCircle2 className="h-3 w-3" />
            approved
          </span>
        )}
      </button>

      {/* Expanded detail panel */}
      {expanded ? (
        <div className="border-t border-sage-border/70 bg-white/40 px-3 py-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Left column — qualitative fields */}
            <FieldBlock
              label="Element / function"
              cell={row.elementFunction}
              onChange={(v) => onText("elementFunction", v)}
            />
            <FieldBlock
              label="Failure mode"
              cell={row.failureMode}
              onChange={(v) => onText("failureMode", v)}
            />
            <FieldBlock
              label="Effects of failure"
              cell={row.effects}
              onChange={(v) => onText("effects", v)}
              multiline
            />
            <FieldBlock
              label="Potential causes"
              cell={row.causes}
              onChange={(v) => onText("causes", v)}
              multiline
            />
            <FieldBlock
              label="Prevention controls"
              cell={row.prevention}
              onChange={(v) => onText("prevention", v)}
              multiline
            />
            <FieldBlock
              label="Detection controls"
              cell={row.detection}
              onChange={(v) => onText("detection", v)}
              multiline
            />
          </div>

          {/* Scores row */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <NumericField
              label="Severity (S)"
              cell={row.severity}
              onChange={(v) => onNumber("severity", v)}
            />
            <NumericField
              label="Occurrence (O)"
              cell={row.occurrence}
              onChange={(v) => onNumber("occurrence", v)}
            />
            <NumericField
              label="Detection (D)"
              cell={row.detectionScore}
              onChange={(v) => onNumber("detectionScore", v)}
            />
          </div>
          <div className="mt-1 text-right text-[10px] text-muted-olive">
            RPN = S × O × D = <span className="font-mono">{row.rpn}</span>
          </div>

          {/* Actions row */}
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <FieldBlock
              label="Recommended corrective actions"
              cell={row.recommendedActions}
              onChange={(v) => onText("recommendedActions", v)}
              multiline
            />
            <FieldBlock
              label="Actions taken"
              cell={row.actionsTaken}
              onChange={(v) => onText("actionsTaken", v)}
              multiline
            />
            <FieldBlock
              label="Responsible"
              cell={row.responsibility}
              onChange={(v) => onText("responsibility", v)}
            />
            <FieldBlock
              label="Due date"
              cell={row.dueDate}
              onChange={(v) => onText("dueDate", v)}
              placeholder="YYYY-MM-DD"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- *
 *  Field primitives
 * -------------------------------------------------------------- */

function FieldBlock({
  label,
  cell,
  onChange,
  multiline,
  placeholder,
}: {
  label: string;
  cell: FmeaCell<string>;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <div className={cn("rounded-md border bg-white/80 p-2", cellBorder(cell.status))}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
          {label}
        </span>
        <StatusChip status={cell.status} />
      </div>
      {multiline ? (
        <textarea
          value={cell.value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={cell.status === "needs_input" ? cell.note ?? "needs input" : placeholder}
          className="block w-full resize-y bg-transparent text-[13px] leading-5 outline-none placeholder:italic placeholder:text-muted-olive"
        />
      ) : (
        <input
          type="text"
          value={cell.value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={cell.status === "needs_input" ? cell.note ?? "needs input" : placeholder}
          className="block w-full bg-transparent text-[13px] outline-none placeholder:italic placeholder:text-muted-olive"
        />
      )}
      {cell.source ? (
        <div className="mt-1 truncate font-mono text-[10px] text-muted-olive">
          evidence: {cell.source}
        </div>
      ) : null}
    </div>
  );
}

function NumericField({
  label,
  cell,
  onChange,
}: {
  label: string;
  cell: FmeaCell<number>;
  onChange: (v: number) => void;
}) {
  const v = cell.value ?? 0;
  return (
    <div className={cn("rounded-md border bg-white/80 p-2", cellBorder(cell.status))}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
          {label}
        </span>
        <StatusChip status={cell.status} />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-emerald-600"
        />
        <input
          type="number"
          min={1}
          max={10}
          value={v === 0 ? "" : v}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.max(1, Math.min(10, n)));
          }}
          className="w-14 rounded border border-sage-border bg-white px-2 py-1 text-center text-sm font-bold outline-none focus:border-light-border"
        />
      </div>
      {cell.source ? (
        <div className="mt-1 truncate font-mono text-[10px] text-muted-olive">
          evidence: {cell.source}
        </div>
      ) : null}
    </div>
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

function ScorePill({
  label,
  value,
  status,
}: {
  label: string;
  value: number | null;
  status: FmeaStatus;
}) {
  const tone =
    status === "grounded"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : status === "suggested"
        ? "bg-violet-50 text-violet-800 ring-violet-200"
        : "bg-amber-50 text-amber-800 ring-amber-200";
  return (
    <span
      className={cn(
        "inline-flex h-6 w-12 items-center justify-center gap-1 rounded-sm text-[11px] font-semibold ring-1 ring-inset",
        tone,
      )}
      title={`${label} = ${value ?? "—"} (${status})`}
    >
      <span className="font-mono">{label}</span>
      <span className="tabular-nums">{value ?? "—"}</span>
    </span>
  );
}

function RpnBadge({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-[60px] items-center justify-center rounded-md px-2 text-sm font-extrabold tabular-nums",
        rpnBand(value),
      )}
      title={`RPN = S × O × D = ${value}`}
    >
      {value}
    </span>
  );
}

function StatusChip({ status }: { status: FmeaStatus }) {
  if (status === "grounded") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-sm bg-emerald-100 px-1 py-0 text-[9px] font-semibold uppercase tracking-wider text-emerald-800 ring-1 ring-inset ring-emerald-200"
        title="grounded — cited by a DB row"
      >
        <CheckCircle2 className="h-2.5 w-2.5" />
        grounded
      </span>
    );
  }
  if (status === "suggested") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-sm bg-violet-100 px-1 py-0 text-[9px] font-semibold uppercase tracking-wider text-violet-800 ring-1 ring-inset ring-violet-200"
        title="AI suggestion — review before accepting"
      >
        <Sparkles className="h-2.5 w-2.5" />
        ai
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm bg-amber-100 px-1 py-0 text-[9px] font-semibold uppercase tracking-wider text-amber-800 ring-1 ring-inset ring-amber-200"
      title="needs input from the engineer"
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      needs
    </span>
  );
}

function FilterSegment({
  value,
  onChange,
  stats,
}: {
  value: FilterMode;
  onChange: (v: FilterMode) => void;
  stats: { n: number; reviewRows: number; approvedRows: number };
}) {
  const options: Array<{
    key: FilterMode;
    label: string;
    count: number;
  }> = [
    { key: "all", label: "all", count: stats.n },
    { key: "needs_review", label: "needs review", count: stats.reviewRows },
    { key: "approved", label: "approved", count: stats.approvedRows },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-sage-border bg-parchment text-[10px] font-semibold uppercase tracking-wider">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "px-2 py-0.5",
            value === o.key
              ? "bg-emerald-600 text-white"
              : "text-muted-olive hover:bg-sage-cream",
          )}
        >
          {o.label} <span className="ml-1 tabular-nums">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- *
 *  Helpers
 * -------------------------------------------------------------- */

function bump<T extends string>(
  cell: FmeaCell<T>,
  nextValue: string,
): FmeaCell<T> {
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
  if (rpn >= 200) return "bg-red-600 text-white ring-1 ring-inset ring-red-700";
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
