"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleDot,
  FilePlus2,
  Loader2,
  Phone,
  RefreshCw,
  Sparkles,
  User,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  QmFact,
  QmFacts,
  QmReportDetail,
  QmSummary,
} from "@/lib/qm-reports/types";

export function QmReportView({ initial }: { initial: QmReportDetail }) {
  const [report, setReport] = useState<QmReportDetail>(initial);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(async () => {
    setRegenerating(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/qm-reports/${encodeURIComponent(String(report.id))}/summarize`,
        { method: "POST" },
      );
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `summarise ${r.status}`);
      }
      const body = (await r.json()) as { summary: QmSummary };
      setReport((prev) => ({ ...prev, summary: body.summary ?? null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(false);
    }
  }, [report.id]);

  const received = new Date(report.receivedAt);
  const turns = useMemo(() => parseTurns(report.transcript), [report.transcript]);

  const facts = report.summary?.facts ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-6 py-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-xs text-muted-olive">
          <span className="font-mono">QM-{report.id}</span>
          <span>· received {received.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-deep-olive">
            Voice report #{report.id}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-olive">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {report.phone ?? "unknown caller"}
            </span>
            <span>{formatDuration(report.durationSec)}</span>
            {facts?.line?.value ? (
              <span className="rounded bg-sage-cream px-2 py-0.5 text-[11px] font-semibold uppercase text-muted-olive ring-1 ring-inset ring-sage-border">
                {facts.line.value}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void regenerate()}
            disabled={regenerating}
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Regenerate summary
          </Button>
          <Button asChild size="sm">
            <Link href={`/report/new?qm_report_id=${report.id}`}>
              <FilePlus2 className="h-3.5 w-3.5" />
              Create 8D draft
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {/* Key facts at the top of the page */}
      <Card>
        <CardHeader>
          <CardTitle>Key facts</CardTitle>
          <CardDescription>
            Extracted by the co-pilot from the transcript. Every value shows
            whether it&apos;s{" "}
            <StatusChip status="grounded" small /> (quoted),{" "}
            <StatusChip status="suggested" small /> (inference), or{" "}
            <StatusChip status="missing" small /> (not mentioned).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {facts ? (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
              <FactCell label="Factory" fact={facts.factory} />
              <FactCell label="Line" fact={facts.line} />
              <FactCell label="Section / station" fact={facts.section} />
              <FactCell label="Article" fact={facts.article} />
              <FactCell label="Part" fact={facts.part} />
              <FactCell label="Defect code" fact={facts.defect_code} />
              <FactCell label="Severity" fact={facts.severity} />
              <FactCell label="Quantity" fact={facts.quantity} render={(v) => String(v)} />
              <FactCell label="Product" fact={facts.product_id} />
              <FactCell label="Order" fact={facts.order_id} />
              <FactCell label="Caller role" fact={facts.caller_role} />
              <FactCell
                label="Keywords"
                fact={facts.keywords}
                render={(v) => (Array.isArray(v) ? v.join(", ") : "—")}
                wide
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-sage-border p-6 text-center text-sm text-muted-olive">
              No summary cached yet.{" "}
              <button
                type="button"
                className="text-sky-600 underline-offset-2 hover:underline"
                onClick={() => void regenerate()}
              >
                Generate one now.
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            AI summary
          </CardTitle>
          <CardDescription>
            {report.summary
              ? `Produced ${new Date(report.summary.generatedAt).toLocaleString()}.`
              : "No summary yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.summary ? (
            <div className="space-y-3">
              <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-900 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-100">
                {report.summary.summaryShort}
              </div>
              <div
                className={cn(
                  "text-sm leading-6 text-olive-ink",
                  "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
                  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
                  "[&_strong]:font-semibold [&_em]:italic",
                  "[&_code]:rounded [&_code]:bg-sage-cream [&_code]:px-1 [&_code]:font-mono",
                )}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {report.summary.summaryLong}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="text-sm italic text-muted-olive">
              Hit <b>Regenerate summary</b> to produce one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transcript */}
      <Card>
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
          <CardDescription>
            {turns.length > 0
              ? `${turns.length} turns · ${report.transcript.length} characters`
              : "Empty transcript."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {turns.length > 0 ? (
            <ul className="space-y-2">
              {turns.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <div
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
                      t.speaker === "Agent"
                        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                        : "bg-zinc-100 text-zinc-800 ring-zinc-200",
                    )}
                    title={t.speaker}
                  >
                    {t.speaker === "Agent" ? (
                      <Bot className="h-3.5 w-3.5" />
                    ) : (
                      <User className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "inline-block rounded-md px-3 py-2 text-sm leading-6",
                      t.speaker === "Agent"
                        ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                        : "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100",
                    )}
                  >
                    {t.text}
                  </div>
                </li>
              ))}
            </ul>
          ) : report.transcript ? (
            <pre className="whitespace-pre-wrap rounded-md bg-sage-cream p-3 text-xs leading-6 text-olive-ink">
              {report.transcript}
            </pre>
          ) : (
            <div className="rounded-md border border-dashed border-sage-border p-6 text-center text-sm text-muted-olive">
              Call ended before any content was captured.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- *
 *  Helpers
 * -------------------------------------------------------------- */

function FactCell<T>({
  label,
  fact,
  render,
  wide,
}: {
  label: string;
  fact: QmFact<T>;
  render?: (v: T) => string;
  wide?: boolean;
}) {
  const status = fact.status;
  const value =
    fact.value != null
      ? render
        ? render(fact.value)
        : String(fact.value)
      : null;
  return (
    <div
      className={cn(
        "rounded-md border bg-white/60 p-2",
        wide ? "col-span-2" : "",
        status === "grounded"
          ? "border-emerald-200"
          : status === "suggested"
            ? "border-violet-200"
            : "border-sage-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-olive">
          {label}
        </span>
        <StatusChip status={status} small />
      </div>
      <div
        className={cn(
          "mt-0.5 break-words text-sm",
          status === "missing" ? "italic text-muted-olive" : "text-olive-ink",
        )}
      >
        {status === "missing" ? "not mentioned" : value}
      </div>
      {fact.source && status !== "missing" ? (
        <div className="mt-1 line-clamp-2 text-[10px] italic text-muted-olive">
          “{fact.source}”
        </div>
      ) : null}
    </div>
  );
}

function StatusChip({
  status,
  small,
}: {
  status: QmFacts["factory"]["status"];
  small?: boolean;
}) {
  if (status === "grounded") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-emerald-100 font-semibold uppercase tracking-wider text-emerald-800 ring-1 ring-inset ring-emerald-200",
          small ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]",
        )}
      >
        <CheckCircle2 className={small ? "h-2.5 w-2.5" : "h-3 w-3"} />
        grounded
      </span>
    );
  }
  if (status === "suggested") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-violet-100 font-semibold uppercase tracking-wider text-violet-800 ring-1 ring-inset ring-violet-200",
          small ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]",
        )}
      >
        <Sparkles className={small ? "h-2.5 w-2.5" : "h-3 w-3"} />
        suggested
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-zinc-100 font-semibold uppercase tracking-wider text-zinc-700 ring-1 ring-inset ring-zinc-200",
        small ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]",
      )}
    >
      <CircleDot className={small ? "h-2.5 w-2.5" : "h-3 w-3"} />
      missing
    </span>
  );
}

type Turn = { speaker: "Agent" | "User"; text: string };

function parseTurns(raw: string): Turn[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Turn[] = [];
  for (const line of lines) {
    const m = line.match(/^(Agent|User)\s*:\s*(.*)$/i);
    if (m) {
      out.push({
        speaker: m[1]!.toLowerCase() === "agent" ? "Agent" : "User",
        text: m[2]!.trim(),
      });
    } else if (out.length > 0) {
      // Continuation of the previous speaker.
      out[out.length - 1]!.text += " " + line;
    }
  }
  return out;
}

function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
