"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Headphones,
  Phone,
  Radio,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QmReportListItem } from "@/lib/qm-reports/types";

const POLL_MS = 8_000;
const HIGHLIGHT_MS = 5_000;
const NEW_WINDOW_MS = 5 * 60_000; // treat rows <5 min old as visually "new"
const LIST_MAX = 5;

export function VoiceReportsCard({
  initialItems,
}: {
  initialItems: QmReportListItem[];
}) {
  const [items, setItems] = useState<QmReportListItem[]>(initialItems);
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());
  const [lastPolledAt, setLastPolledAt] = useState<Date | null>(null);
  const [polling, setPolling] = useState(false);
  const [newlyArrived, setNewlyArrived] = useState(0);
  const seenIdsRef = useRef<Set<number>>(
    new Set(initialItems.map((i) => i.id)),
  );

  const poll = useCallback(async () => {
    setPolling(true);
    try {
      const sinceIso = Array.from(seenIdsRef.current).length
        ? latestReceivedAt(items)
        : null;
      const qs = new URLSearchParams();
      if (sinceIso) qs.set("since", sinceIso);
      qs.set("limit", String(LIST_MAX));
      const r = await fetch(`/api/qm-reports?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const body = (await r.json()) as { items: QmReportListItem[] };
      const fresh = body.items ?? [];
      if (fresh.length === 0) {
        // No new rows. We still want to refresh summaries for items we
        // already have (a background summariser may have caught up).
        const r2 = await fetch(
          `/api/qm-reports?limit=${LIST_MAX}`,
          { cache: "no-store" },
        );
        if (r2.ok) {
          const body2 = (await r2.json()) as { items: QmReportListItem[] };
          if (body2.items) mergeItems(body2.items, false);
        }
        return;
      }
      mergeItems(fresh, true);
    } finally {
      setPolling(false);
      setLastPolledAt(new Date());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const mergeItems = useCallback(
    (incoming: QmReportListItem[], flashNew: boolean) => {
      setItems((prev) => {
        const byId = new Map(prev.map((i) => [i.id, i]));
        const newIds: number[] = [];
        for (const it of incoming) {
          if (!byId.has(it.id) && !seenIdsRef.current.has(it.id)) {
            newIds.push(it.id);
          }
          byId.set(it.id, it);
        }
        // Walk seen IDs so we don't flash the same row twice.
        for (const id of newIds) seenIdsRef.current.add(id);
        if (flashNew && newIds.length > 0) {
          setFlashIds((f) => new Set([...f, ...newIds]));
          setNewlyArrived((n) => n + newIds.length);
          setTimeout(() => {
            setFlashIds((f) => {
              const next = new Set(f);
              for (const id of newIds) next.delete(id);
              return next;
            });
          }, HIGHLIGHT_MS);
        }
        const merged = [...byId.values()].sort((a, b) =>
          a.receivedAt < b.receivedAt ? 1 : -1,
        );
        return merged.slice(0, LIST_MAX);
      });
    },
    [],
  );

  useEffect(() => {
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const headerDot = polling
    ? "bg-amber-400 animate-pulse"
    : newlyArrived > 0
      ? "bg-emerald-500"
      : "bg-emerald-500/60";

  const clearNew = () => setNewlyArrived(0);

  return (
    <div
      className="flex h-full flex-col rounded-md border border-sage-border bg-parchment text-olive-ink"
      onMouseEnter={clearNew}
    >
      <div className="flex items-center justify-between gap-3 border-b border-sage-border/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-olive">
            <Radio className="h-3 w-3" />
            Voice reports
          </span>
          <span
            className={cn("inline-block h-1.5 w-1.5 rounded-full", headerDot)}
            title={polling ? "polling…" : "live"}
          />
          <h3 className="truncate text-sm font-bold leading-none tracking-tight text-deep-olive">
            Sina — shop-floor calls
          </h3>
        </div>
        <div className="shrink-0 text-[10px] text-muted-olive">
          {Math.round(POLL_MS / 1000)}s
          {lastPolledAt
            ? " · " +
              lastPolledAt.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
        </div>
      </div>

      <div className="flex-1 px-2 py-1.5">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-sage-border p-3 text-center text-[11px] text-muted-olive">
            No voice reports yet. Incoming calls appear here live.
          </div>
        ) : (
          <ul className="space-y-1">
            {items.map((it) => (
              <VoiceReportRow
                key={it.id}
                item={it}
                flashing={flashIds.has(it.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VoiceReportRow({
  item,
  flashing,
}: {
  item: QmReportListItem;
  flashing: boolean;
}) {
  const received = new Date(item.receivedAt);
  const isNew = Date.now() - received.getTime() < NEW_WINDOW_MS;

  const severity = item.facts?.severity?.value ?? null;
  const sevColor =
    severity === "critical"
      ? "bg-red-500"
      : severity === "high"
        ? "bg-orange-500"
        : severity === "medium"
          ? "bg-amber-400"
          : severity === "low"
            ? "bg-emerald-500"
            : "bg-zinc-300";
  const sevTitle =
    severity ? `severity ${severity}` : "severity not extracted";

  // Single-line row: dot + summary (truncates) + compact meta + chips.
  // All metadata lives in the same flex row so rows stay ~28 px tall.
  return (
    <li>
      <Link
        href={`/qm-reports/${item.id}`}
        className={cn(
          "flex items-center gap-2 rounded-md border bg-white/60 px-2 py-1 text-[12px] transition-all duration-300",
          flashing
            ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
            : "border-sage-border/70 hover:border-light-border hover:bg-white",
        )}
      >
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", sevColor)}
          title={sevTitle}
        />
        <span className="min-w-0 flex-1 truncate font-medium">
          {item.summaryShort ?? (
            <span className="italic text-muted-olive">
              <Sparkles className="mr-1 inline h-3 w-3" />
              summarising…
            </span>
          )}
        </span>
        {item.facts?.line?.value ? (
          <span
            className="shrink-0 rounded bg-sage-cream px-1 text-[9px] font-semibold uppercase text-muted-olive ring-1 ring-inset ring-sage-border"
            title="Line extracted from transcript"
          >
            {item.facts.line.value}
          </span>
        ) : null}
        <span
          className="hidden shrink-0 items-center gap-0.5 text-[10px] text-muted-olive sm:inline-flex"
          title={received.toLocaleString()}
        >
          <Headphones className="h-3 w-3" />
          {received.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span className="hidden shrink-0 items-center gap-0.5 text-[10px] text-muted-olive md:inline-flex">
          <Phone className="h-3 w-3" />
          {item.phone ?? "—"}
        </span>
        <span className="hidden shrink-0 text-[10px] tabular-nums text-muted-olive md:inline">
          {formatDuration(item.durationSec)}
        </span>
        {severity === "critical" ? (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-red-700"
            title="critical"
          >
            <TriangleAlert className="h-3 w-3" />
          </span>
        ) : null}
        {isNew ? (
          <span className="shrink-0 rounded-full bg-amber-500 px-1 text-[9px] font-semibold uppercase text-white">
            new
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function latestReceivedAt(items: QmReportListItem[]): string | null {
  if (!items.length) return null;
  let latest = items[0]!.receivedAt;
  for (const it of items) if (it.receivedAt > latest) latest = it.receivedAt;
  return latest;
}
