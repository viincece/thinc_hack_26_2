"use client";

import { Sparkles, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FieldMeta, FieldStatus } from "./eight-d-doc";

/**
 * Small primitives shared by every 8D section.
 *
 * The `FieldShell` handles the "label + status chip + optional AI-draft
 * button + optional evidence footnote" envelope that every field wears.
 * Content (input, textarea, select, list, …) is a render prop.
 */

export function StatusChip({ meta }: { meta?: FieldMeta }) {
  const status: FieldStatus = meta?.status ?? "empty";
  if (status === "empty") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        empty
      </span>
    );
  }
  if (status === "needs_input") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        title={meta?.note}
      >
        <AlertTriangle className="h-2.5 w-2.5" />
        needs input
      </span>
    );
  }
  if (status === "suggested") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200"
        title={meta?.note}
      >
        <Sparkles className="h-2.5 w-2.5" />
        AI suggestion
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
      title={meta?.source}
    >
      <CheckCircle2 className="h-2.5 w-2.5" />
      grounded
    </span>
  );
}

export function FieldShell({
  label,
  path,
  meta,
  onAiDraft,
  disabled,
  required,
  hint,
  children,
  compact,
}: {
  label: string;
  path?: string;
  meta?: FieldMeta;
  onAiDraft?: () => void;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  const status: FieldStatus = meta?.status ?? "empty";
  const highlight =
    status === "suggested"
      ? "ring-1 ring-violet-200 dark:ring-violet-900"
      : status === "needs_input"
        ? "ring-1 ring-amber-200 dark:ring-amber-900"
        : "";

  return (
    <div
      className={cn(
        "rounded-md bg-white/60 transition-colors dark:bg-zinc-950/40",
        highlight,
        compact ? "p-1.5" : "p-2",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          <span className="truncate">
            {label}
            {required ? <span className="ml-0.5 text-red-500">*</span> : null}
          </span>
          {hint ? (
            <HelpCircle
              className="h-3 w-3 shrink-0 text-zinc-400"
              aria-label={hint}
            >
              <title>{hint}</title>
            </HelpCircle>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusChip meta={meta} />
          {onAiDraft ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={onAiDraft}
              title={`Ask the co-pilot to draft ${path ?? label}`}
              className="h-6 px-1.5"
            >
              <Sparkles className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      </div>
      {children}
      {meta?.note && status === "needs_input" ? (
        <div className="mt-1 text-[11px] italic text-amber-700 dark:text-amber-300">
          {meta.note}
        </div>
      ) : null}
      {meta?.source && status !== "needs_input" ? (
        <div className="mt-1 font-mono text-[10px] text-zinc-500">
          evidence: {meta.source}
        </div>
      ) : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "email" | "tel" | "number" | "date";
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value ?? ""}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
    />
  );
}

export function LongText({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <textarea
      value={value ?? ""}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full resize-y rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm leading-5 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  value: T | "";
  onChange: (v: T | "") => void;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T | "")}
      className="block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700"
      />
      {label}
    </label>
  );
}

export function YesNoPicker({
  value,
  onChange,
  disabled,
}: {
  value: "" | "yes" | "no";
  onChange: (v: "" | "yes" | "no") => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
      {(["yes", "no"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === opt ? "" : opt)}
          className={cn(
            "px-2 py-0.5 text-xs font-medium transition-colors",
            value === opt
              ? opt === "yes"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-700 text-white"
              : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900",
          )}
        >
          {opt === "yes" ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}
