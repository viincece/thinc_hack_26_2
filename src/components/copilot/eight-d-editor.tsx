"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Shield,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SECTIONS,
  SECTION_FIELDS,
  SECTION_HINT,
  SECTION_TITLES,
  type EightDDoc,
  type FieldMetaMap,
  type SectionKey,
} from "./eight-d-doc";
import {
  SectionD0,
  SectionD1,
  SectionD2,
  SectionD3,
  SectionD4,
  SectionD5,
  SectionD6,
  SectionD7,
  SectionD8,
} from "./eight-d-sections";

export type SectionStat = {
  filled: number;
  suggested: number;
  needsInput: number;
  total: number;
};

function computeSectionStats(meta: FieldMetaMap): Record<SectionKey, SectionStat> {
  const stats = {} as Record<SectionKey, SectionStat>;
  for (const s of SECTIONS) {
    const paths = SECTION_FIELDS[s];
    let filled = 0;
    let suggested = 0;
    let needsInput = 0;
    for (const p of paths) {
      const m = meta[p];
      if (m?.status === "filled") filled++;
      else if (m?.status === "suggested") suggested++;
      else if (m?.status === "needs_input") needsInput++;
    }
    stats[s] = { filled, suggested, needsInput, total: paths.length };
  }
  return stats;
}

function totalStats(stats: Record<SectionKey, SectionStat>): SectionStat {
  return SECTIONS.reduce(
    (acc, s) => ({
      filled: acc.filled + stats[s].filled,
      suggested: acc.suggested + stats[s].suggested,
      needsInput: acc.needsInput + stats[s].needsInput,
      total: acc.total + stats[s].total,
    }),
    { filled: 0, suggested: 0, needsInput: 0, total: 0 },
  );
}

export function EightDEditor({
  doc,
  meta,
  onField,
  onAsk,
  onAutoDraftAll,
  pendingPath,
  disabled,
  busy,
}: {
  doc: EightDDoc;
  meta: FieldMetaMap;
  onField: (path: string, value: unknown) => void;
  onAsk: (path: string, label: string) => void;
  onAutoDraftAll: () => void;
  pendingPath: string | null;
  disabled?: boolean;
  busy?: boolean;
}) {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    D0: true,
    D1: true,
    D2: true,
    D3: true,
    D4: true,
    D5: true,
    D6: true,
    D7: true,
    D8: true,
  });
  const toggle = (s: SectionKey) =>
    setOpen((p) => ({ ...p, [s]: !p[s] }));

  const stats = useMemo(() => computeSectionStats(meta), [meta]);
  const total = useMemo(() => totalStats(stats), [stats]);

  const commonProps = { doc, meta, onField, onAsk, disabled };

  return (
    <div className="flex h-full flex-col">
      {/* Header strip */}
      <div className="border-b border-zinc-200 bg-white/80 px-5 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              8D Report · draft
            </div>
            <div className="text-sm font-medium">
              Quality co-pilot — structured editor
            </div>
          </div>
          <Button
            onClick={onAutoDraftAll}
            disabled={disabled || busy}
            size="sm"
            title="Ask the agent to populate every section using Manex + wiki"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Auto-draft all sections
          </Button>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
            <div
              className="bg-emerald-500"
              style={{ width: `${(total.filled / Math.max(1, total.total)) * 100}%` }}
              title={`${total.filled} grounded`}
            />
            <div
              className="bg-violet-400"
              style={{
                width: `${(total.suggested / Math.max(1, total.total)) * 100}%`,
              }}
              title={`${total.suggested} AI-suggested`}
            />
            <div
              className="bg-amber-400"
              style={{
                width: `${(total.needsInput / Math.max(1, total.total)) * 100}%`,
              }}
              title={`${total.needsInput} needs input`}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
            <Legend
              color="bg-emerald-500"
              label={`${total.filled} grounded`}
              icon={<CheckCircle2 className="h-3 w-3" />}
            />
            <Legend
              color="bg-violet-400"
              label={`${total.suggested} AI suggestions`}
              icon={<Sparkles className="h-3 w-3" />}
            />
            <Legend
              color="bg-amber-400"
              label={`${total.needsInput} need your input`}
              icon={<AlertTriangle className="h-3 w-3" />}
            />
            <span className="ml-auto inline-flex items-center gap-1 text-zinc-400">
              <Shield className="h-3 w-3" />
              Agent is grounded: IDs/values only from wiki &amp; Manex.
            </span>
          </div>
        </div>

        {/* Section jump row */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => {
            const st = stats[s];
            return (
              <a
                key={s}
                href={`#section-${s}`}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                  "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900",
                  st.needsInput > 0
                    ? "ring-1 ring-amber-300"
                    : st.suggested > 0
                      ? "ring-1 ring-violet-300"
                      : st.filled > 0
                        ? "ring-1 ring-emerald-300"
                        : "",
                )}
                title={SECTION_TITLES[s]}
              >
                <span className="font-semibold">{s}</span>
                <span className="ml-1 text-[10px] text-zinc-400">
                  {st.filled + st.suggested}/{st.total}
                </span>
              </a>
            );
          })}
        </div>
      </div>

      {/* Sections body */}
      <div className="flex-1 space-y-4 overflow-y-auto bg-zinc-50/70 p-4 dark:bg-zinc-900/40">
        {SECTIONS.map((s) => {
          const st = stats[s];
          const isOpen = open[s];
          const sectionHasPending =
            pendingPath != null &&
            (SECTION_FIELDS[s] as readonly string[]).some((p) =>
              pendingPath === p || pendingPath.startsWith(`${p}.`),
            );
          return (
            <section
              key={s}
              id={`section-${s}`}
              className={cn(
                "scroll-mt-4 rounded-xl border bg-white shadow-sm transition-shadow dark:bg-zinc-950",
                sectionHasPending
                  ? "border-violet-400 ring-2 ring-violet-200/60"
                  : "border-zinc-200 dark:border-zinc-800",
              )}
            >
              <header className="flex cursor-pointer select-none items-center gap-3 px-4 py-2">
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  className="flex items-center gap-2 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-400" />
                  )}
                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white dark:bg-zinc-50 dark:text-zinc-900">
                    {s}
                  </span>
                  <span className="text-sm font-semibold">
                    {SECTION_TITLES[s]}
                  </span>
                </button>
                <span className="text-xs text-zinc-500">{SECTION_HINT[s]}</span>
                <div className="ml-auto flex items-center gap-2">
                  <SectionStatPill st={st} />
                </div>
              </header>
              {isOpen ? (
                <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-900">
                  {s === "D0" && <SectionD0 {...commonProps} />}
                  {s === "D1" && <SectionD1 {...commonProps} />}
                  {s === "D2" && <SectionD2 {...commonProps} />}
                  {s === "D3" && <SectionD3 {...commonProps} />}
                  {s === "D4" && <SectionD4 {...commonProps} />}
                  {s === "D5" && <SectionD5 {...commonProps} />}
                  {s === "D6" && <SectionD6 {...commonProps} />}
                  {s === "D7" && <SectionD7 {...commonProps} />}
                  {s === "D8" && <SectionD8 {...commonProps} />}
                </div>
              ) : null}
            </section>
          );
        })}
        <div className="py-4 text-center text-[11px] text-zinc-400">
          Structured 8D template.
        </div>
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  icon,
}: {
  color: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-1.5 w-3 rounded-sm", color)} />
      {icon}
      {label}
    </span>
  );
}

function SectionStatPill({ st }: { st: SectionStat }) {
  if (st.needsInput > 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        <AlertTriangle className="h-2.5 w-2.5" />
        {st.needsInput} needs input
      </span>
    );
  if (st.suggested > 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200">
        <Sparkles className="h-2.5 w-2.5" />
        {st.suggested} suggested
      </span>
    );
  if (st.filled > 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
        <CheckCircle2 className="h-2.5 w-2.5" />
        {st.filled}/{st.total}
      </span>
    );
  return (
    <span className="text-[10px] text-zinc-400">
      {st.filled + st.suggested}/{st.total}
    </span>
  );
}
