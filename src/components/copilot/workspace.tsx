"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { EightDEditor } from "./eight-d-editor";
import { Chat } from "./chat";
import { readSse } from "./sse";
import {
  SECTIONS,
  type ChatTurn,
  type InitiativeDraft,
  type Section,
} from "./types";

function emptySections(): Record<Section, string> {
  return SECTIONS.reduce(
    (acc, s) => ({ ...acc, [s]: "" }),
    {} as Record<Section, string>,
  );
}

type ApiMessage = {
  role: "user" | "assistant";
  content: string;
};

export function ReportWorkspace({
  contextNote,
}: {
  contextNote?: string;
}) {
  const [sections, setSections] = useState<Record<Section, string>>(
    emptySections(),
  );
  const [pendingSection, setPendingSection] = useState<Section | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [initiatives, setInitiatives] = useState<
    Array<{ key: string; draft: InitiativeDraft }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");

  // Transcript of raw text sent to the API (assistant side = final text only).
  const apiHistoryRef = useRef<ApiMessage[]>([]);

  const updateSection = useCallback((s: Section, v: string) => {
    setSections((prev) => ({ ...prev, [s]: v }));
  }, []);

  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || busy) return;

      const userTurn: ChatTurn = {
        id: `u-${Date.now()}`,
        role: "user",
        text,
      };
      const assistantTurn: ChatTurn = {
        id: `a-${Date.now() + 1}`,
        role: "assistant",
        text: "",
        toolCalls: [],
      };
      setTurns((prev) => [...prev, userTurn, assistantTurn]);
      if (!overrideText) setInput("");
      setBusy(true);

      apiHistoryRef.current.push({ role: "user", content: text });
      const apiMessages = [...apiHistoryRef.current];

      try {
        const resp = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, contextNote }),
        });
        if (!resp.ok) {
          const j = await resp.json().catch(() => null);
          throw new Error(j?.error ?? `agent ${resp.status}`);
        }

        let assistantText = "";

        for await (const ev of readSse(resp)) {
          if (ev.type === "text_delta") {
            assistantText += ev.text;
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantTurn.id ? { ...t, text: t.text + ev.text } : t,
              ),
            );
          } else if (ev.type === "tool_use") {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantTurn.id
                  ? {
                      ...t,
                      toolCalls: [
                        ...(t.toolCalls ?? []),
                        {
                          id: ev.id,
                          name: ev.name,
                          purpose: ev.purpose,
                        },
                      ],
                    }
                  : t,
              ),
            );
          } else if (ev.type === "tool_result") {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantTurn.id
                  ? {
                      ...t,
                      toolCalls: (t.toolCalls ?? []).map((tc) =>
                        tc.id === ev.id
                          ? { ...tc, summary: ev.summary, ok: ev.ok }
                          : tc,
                      ),
                    }
                  : t,
              ),
            );
          } else if (ev.type === "ui") {
            const e = ev.event;
            if (e.type === "update_report_section") {
              const sec = e.section as Section;
              if (SECTIONS.includes(sec)) {
                setSections((prev) => ({ ...prev, [sec]: e.markdown }));
                setPendingSection(sec);
                setTimeout(
                  () =>
                    setPendingSection((curr) => (curr === sec ? null : curr)),
                  1500,
                );
              }
            } else if (e.type === "propose_initiative") {
              const key = `i-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 7)}`;
              setInitiatives((prev) => [...prev, { key, draft: e.payload }]);
            }
          } else if (ev.type === "error") {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantTurn.id
                  ? { ...t, text: (t.text ? t.text + "\n\n" : "") + `⚠ ${ev.message}` }
                  : t,
              ),
            );
          }
        }

        apiHistoryRef.current.push({
          role: "assistant",
          content: assistantText || "(tool call only)",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setTurns((prev) =>
          prev.map((t) =>
            t.id === assistantTurn.id
              ? { ...t, text: (t.text ? t.text + "\n\n" : "") + `⚠ ${msg}` }
              : t,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, input, contextNote],
  );

  const onAskFill = useCallback(
    (s: Section) => {
      const prompt = `Draft section ${s} of the 8D using the tools available. ` +
        `Call update_report_section with section=${s} when you're done. ` +
        `Be concrete, cite row IDs, and stay under ~150 words.`;
      void send(prompt);
    },
    [send],
  );

  const contextHeader = useMemo(() => {
    if (!contextNote) return null;
    return (
      <div className="border-b border-zinc-200 bg-amber-50 px-5 py-2 text-xs text-amber-900 dark:border-zinc-800 dark:bg-amber-950/30 dark:text-amber-200">
        Context loaded: {contextNote.slice(0, 140)}
        {contextNote.length > 140 ? "…" : ""}
      </div>
    );
  }, [contextNote]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {contextHeader}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
        <div className="min-h-0 border-zinc-200 dark:border-zinc-800 lg:border-r">
          <EightDEditor
            sections={sections}
            onChange={updateSection}
            onAskFill={onAskFill}
            pendingSection={pendingSection}
            disabled={busy}
          />
        </div>
        <div className="min-h-0">
          <Chat
            turns={turns}
            onSend={() => send()}
            onDismissInitiative={(key) =>
              setInitiatives((prev) => prev.filter((i) => i.key !== key))
            }
            onInitiativeConfirmed={(key) =>
              setInitiatives((prev) => prev.filter((i) => i.key !== key))
            }
            initiatives={initiatives}
            busy={busy}
            input={input}
            setInput={setInput}
          />
        </div>
      </div>
    </div>
  );
}
