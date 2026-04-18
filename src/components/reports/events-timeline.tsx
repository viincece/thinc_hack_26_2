"use client";

import {
  Cog,
  FileText,
  Package,
  Rocket,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { TimelineEvent, TimelineEventKind } from "@/lib/reports/types";

/**
 * Short chronological log of everything that happened to the product
 * this incident touches. Preferred over a chart because the engineer
 * reads it the same way they'd read a Git log.
 */

const KIND_META: Record<
  TimelineEventKind,
  { icon: typeof Cog; chip: string; label: string }
> = {
  build: {
    icon: Package,
    chip: "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900",
    label: "Build",
  },
  defect: {
    icon: FileText,
    chip: "bg-red-100 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900",
    label: "Defect",
  },
  rework: {
    icon: Wrench,
    chip: "bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-900",
    label: "Rework",
  },
  claim: {
    icon: Rocket,
    chip: "bg-orange-100 text-orange-800 ring-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-900",
    label: "Claim",
  },
  action: {
    icon: Sparkles,
    chip: "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900",
    label: "Initiative",
  },
};

function fmtWhen(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EventsTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
        No related events found on this product yet.
      </div>
    );
  }

  // Compute deltas — days since the first event — so the engineer can
  // scan at a glance how long each hop took.
  const t0 = new Date(events[0]!.ts).getTime();

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-zinc-50 text-left text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
          <tr>
            <th className="w-36 px-3 py-2 font-semibold">When</th>
            <th className="w-20 px-3 py-2 font-semibold">Kind</th>
            <th className="w-32 px-3 py-2 font-semibold">Reference</th>
            <th className="px-3 py-2 font-semibold">Detail</th>
            <th className="w-16 px-3 py-2 text-right font-semibold">Δ days</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => {
            const meta = KIND_META[e.kind] ?? KIND_META.action;
            const Icon = meta.icon;
            const delta =
              i === 0 ? 0 : (new Date(e.ts).getTime() - t0) / 86_400_000;
            return (
              <tr
                key={`${e.kind}_${e.id}_${i}`}
                className="border-t border-zinc-100 hover:bg-zinc-50/60 dark:border-zinc-900 dark:hover:bg-zinc-900/40"
              >
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {fmtWhen(e.ts)}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${meta.chip}`}
                  >
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {e.id}
                </td>
                <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">
                  <span className="line-clamp-2">{e.label}</span>
                  {e.severity ? (
                    <span className="ml-1 rounded bg-zinc-100 px-1 text-[9px] uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {e.severity}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-[11px] text-zinc-500">
                  {i === 0 ? "0" : `+${delta.toFixed(1)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
