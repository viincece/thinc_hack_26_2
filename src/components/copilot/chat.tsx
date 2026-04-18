"use client";

import { useEffect, useRef } from "react";
import { Bot, User, Wrench, CircleAlert, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatTurn, InitiativeDraft } from "./types";
import { InitiativeCard } from "./initiative-card";

export function Chat({
  turns,
  onSend,
  onDismissInitiative,
  onInitiativeConfirmed,
  initiatives,
  busy,
  input,
  setInput,
}: {
  turns: ChatTurn[];
  onSend: () => void;
  onDismissInitiative: (key: string) => void;
  onInitiativeConfirmed: (key: string, actionId: string) => void;
  initiatives: Array<{ key: string; draft: InitiativeDraft }>;
  busy: boolean;
  input: string;
  setInput: (v: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, initiatives.length, busy]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          S³ · SixSigmaSense
        </div>
        <div className="text-sm font-medium">
          Grounded in your Manex API
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {turns.length === 0 ? (
          <Empty />
        ) : (
          turns.map((t) => <Turn key={t.id} turn={t} />)
        )}

        {initiatives.length > 0 ? (
          <div className="space-y-2">
            {initiatives.map((i) => (
              <InitiativeCard
                key={i.key}
                draft={i.draft}
                onConfirmed={(id) => onInitiativeConfirmed(i.key, id)}
                onDismiss={() => onDismissInitiative(i.key)}
              />
            ))}
          </div>
        ) : null}

        {busy ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            thinking…
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!busy) onSend();
              }
            }}
            placeholder="Ask the co-pilot… e.g. 'What's causing the SOLDER_COLD spike?'"
            rows={2}
            className="min-h-[42px] flex-1 resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
          />
          <Button onClick={onSend} disabled={busy || !input.trim()}>
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function Empty() {
  const suggestions = [
    "Investigate the SOLDER_COLD spike in Feb 2026.",
    "Any field claims on ART-00001 that aren't matched to a defect?",
    "Which operators correlate with visual defects?",
    "Draft D2 — problem description — for this incident.",
  ];
  return (
    <div className="rounded-lg border border-dashed border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
      <div className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
        Start with a question.
      </div>
      <ul className="space-y-1">
        {suggestions.map((s) => (
          <li key={s} className="text-xs">
            · {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          isUser
            ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn("min-w-0 flex-1", isUser && "text-right")}>
        {turn.toolCalls && turn.toolCalls.length > 0 ? (
          <div className="mb-1 space-y-1">
            {turn.toolCalls.map((tc) => (
              <ToolCallPill key={tc.id} tc={tc} />
            ))}
          </div>
        ) : null}
        {turn.text ? (
          <div
            className={cn(
              "inline-block whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6",
              isUser
                ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50",
            )}
          >
            {turn.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolCallPill({
  tc,
}: {
  tc: NonNullable<ChatTurn["toolCalls"]>[number];
}) {
  return (
    <div className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-1.5">
        {tc.ok === false ? (
          <CircleAlert className="h-3 w-3 text-red-500" />
        ) : (
          <Wrench className="h-3 w-3 text-zinc-500" />
        )}
        <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
          {tc.name}
        </span>
      </div>
      {tc.purpose ? (
        <div className="text-[11px] text-zinc-500">{tc.purpose}</div>
      ) : null}
      {tc.summary ? (
        <div className="line-clamp-2 text-[11px] text-zinc-500">
          {tc.summary}
        </div>
      ) : null}
    </div>
  );
}
