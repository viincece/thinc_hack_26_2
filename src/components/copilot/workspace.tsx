"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EightDEditor } from "./eight-d-editor";
import { Chat } from "./chat";
import { ReportSidepanel } from "./report-sidepanel";
import { readSse } from "./sse";
import {
  applyFieldPatch,
  defaultDoc,
  isFieldPath,
  type EightDDoc,
  type FieldMetaMap,
} from "./eight-d-doc";
import type { ChatTurn, FieldPatchEvent, InitiativeDraft } from "./types";

const SIDEPANEL_PREF_KEY = "quality-copilot:sidepanel-collapsed";

type ApiMessage = {
  role: "user" | "assistant";
  content: string;
};

export function ReportWorkspace({
  contextNote,
}: {
  contextNote?: string;
}) {
  const [doc, setDoc] = useState<EightDDoc>(() => defaultDoc());
  const [meta, setMeta] = useState<FieldMetaMap>({});
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [initiatives, setInitiatives] = useState<
    Array<{ key: string; draft: InitiativeDraft }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");

  // Persisted-draft metadata.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>("");
  const [savingState, setSavingState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Sidepanel collapsed/expanded, persisted to localStorage.
  const [sidepanelCollapsed, setSidepanelCollapsed] = useState(false);
  useEffect(() => {
    try {
      const pref = localStorage.getItem(SIDEPANEL_PREF_KEY);
      if (pref === "1") setSidepanelCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);
  const toggleSidepanel = useCallback(() => {
    setSidepanelCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEPANEL_PREF_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const apiHistoryRef = useRef<ApiMessage[]>([]);

  const onField = useCallback((path: string, value: unknown) => {
    setDoc((prev) => applyFieldPatch(prev, path, value));
    // Manual edit = promote to "filled" (grounded by the engineer).
    setMeta((prev) => ({
      ...prev,
      [path]: {
        status: "filled",
        source: "engineer edit",
      },
    }));
    setSavingState((prev) => (prev === "saved" ? "idle" : prev));
  }, []);

  const applyPatchFromAgent = useCallback((ev: FieldPatchEvent) => {
    if (!isFieldPath(ev.path)) return;
    if (ev.status !== "needs_input" && ev.value !== undefined && ev.value !== null) {
      setDoc((prev) => applyFieldPatch(prev, ev.path, ev.value));
    }
    setMeta((prev) => ({
      ...prev,
      [ev.path]: {
        status: ev.status,
        source: ev.source,
        note: ev.note,
      },
    }));
    setPendingPath(ev.path);
    setTimeout(() => {
      setPendingPath((curr) => (curr === ev.path ? null : curr));
    }, 1800);
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
            if (e.type === "update_report_field") {
              applyPatchFromAgent(e);
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
                  ? {
                      ...t,
                      text:
                        (t.text ? t.text + "\n\n" : "") + `⚠ ${ev.message}`,
                    }
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
    [busy, input, contextNote, applyPatchFromAgent],
  );

  const onAsk = useCallback(
    (path: string, label: string) => {
      const prompt =
        `Draft the 8D field \`${path}\` (${label}). ` +
        `Use ONLY facts you can cite from the knowledge graph or Manex. ` +
        `Call \`update_report_field\` with path="${path}" and either:\n` +
        `  • status="filled" + the value + a \`source\` list of row IDs, if grounded\n` +
        `  • status="suggested" + the value + closest evidence, if informed-guess\n` +
        `  • status="needs_input" + a short \`note\` explaining what the engineer must supply, if unknown.\n` +
        `Never invent IDs, names, numbers, dates, or emails.`;
      void send(prompt);
    },
    [send],
  );

  const onAutoDraftAll = useCallback(() => {
    const prompt =
      `AUTO-DRAFT MODE — populate the entire 8D editor end-to-end.\n\n` +
      `Method\n` +
      `1. If incident context was provided, anchor on it with \`kg_anchor\` / \`kg_search\`. ` +
      `If no incident was provided, still run \`kg_search\` for the most recent defect spike to pick a ` +
      `representative anchor, and mark all complaint-specific header fields as \`needs_input\` with a short note.\n` +
      `2. Visit the fields in this order and BATCH multiple \`update_report_field\` calls in each turn: ` +
      `D0 header → D2 problem → D4 occurrence / detection → D3 containment → D5 planned → D6 implemented → ` +
      `D7 preventive → D1 team → D8 closure.\n` +
      `3. For each field choose exactly one status:\n` +
      `   • \`filled\` — supported by a row in Manex / wiki. Include \`source\` (comma-separated row IDs).\n` +
      `   • \`suggested\` — informed inference from evidence. Include closest evidence as \`source\`.\n` +
      `   • \`needs_input\` — data cannot answer (signatures, external contacts, future dates, human judgement). ` +
      `Leave \`value\` null; supply a one-sentence \`note\` telling the engineer what to gather.\n` +
      `4. When in doubt between suggested and needs_input → pick \`needs_input\`. Hallucination is the worst outcome.\n\n` +
      `Value shapes (recap)\n` +
      `- Strings: \`problem\`, \`customer.*\`, \`supplier.*\`, \`firstOkPo\`, \`otherPartsWhich\`, \`appreciation\`.\n` +
      `- ISO dates (YYYY-MM-DD): \`complaintDate\`, \`reportDate\`, \`firstOkDate\`.\n` +
      `- Objects: \`champion\`, \`coordinator\` = {name, department, contact}.\n` +
      `- Arrays: \`team\`, \`plannedOccurrence\`, \`plannedDetection\`, \`implementedOccurrence\`, \`implementedDetection\`.\n` +
      `- \`occurrence\` / \`detection\` = {categories: SixM[], potentialCause, whys: string[5], rootCauses: [{text, participation}]}.\n` +
      `- Yes/no fields: \`'yes'\` or \`'no'\`.\n\n` +
      `Begin with a brief one-line ack in chat ("Drafting all 8D sections…"), then fire field patches. ` +
      `Do not repeat ids in chat text — they go in the \`source\` field of each patch.`;
    void send(prompt);
  }, [send]);

  const contextHeader = useMemo(() => {
    if (!contextNote) return null;
    return (
      <div className="border-b border-zinc-200 bg-amber-50 px-5 py-2 text-xs text-amber-900 dark:border-zinc-800 dark:bg-amber-950/30 dark:text-amber-200">
        Context loaded: {contextNote.slice(0, 140)}
        {contextNote.length > 140 ? "…" : ""}
      </div>
    );
  }, [contextNote]);

  /* ---------------- draft persistence ---------------- */

  const deriveDefaultName = useCallback((d: EightDDoc): string => {
    return (
      d.supplier?.articleName ||
      d.customer?.articleName ||
      (d.problem ? d.problem.slice(0, 60) : "") ||
      "Untitled 8D"
    );
  }, []);

  const onSaveCurrent = useCallback(
    async (name: string) => {
      setSavingState("saving");
      try {
        const r = await fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draftId ?? undefined,
            name: name || deriveDefaultName(doc),
            doc,
            meta,
          }),
        });
        if (!r.ok) throw new Error(`save ${r.status}`);
        const body = (await r.json()) as {
          ok: true;
          draft: { id: string; name: string; updatedAt: string };
        };
        setDraftId(body.draft.id);
        setDraftName(body.draft.name);
        setLastSavedAt(body.draft.updatedAt);
        setSavingState("saved");
      } catch {
        setSavingState("error");
      }
    },
    [doc, meta, draftId, deriveDefaultName],
  );

  const triggerDownload = useCallback((blob: Blob, filename: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  }, []);

  const buildExportFilename = useCallback(
    (ext: "json" | "pdf" | "docx") => {
      const base =
        (draftName || deriveDefaultName(doc))
          .replace(/[^A-Za-z0-9-_ ]+/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 48) || "8d-draft";
      const idPart = draftId ? `_${draftId}` : "";
      const date = new Date().toISOString().slice(0, 10);
      return `8D_${date}${idPart}_${base}.${ext}`;
    },
    [doc, draftId, draftName, deriveDefaultName],
  );

  const onExportCurrent = useCallback(() => {
    const payload = {
      id: draftId ?? `unsaved-${Date.now()}`,
      name: draftName || deriveDefaultName(doc),
      savedAt: new Date().toISOString(),
      doc,
      meta,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    triggerDownload(blob, buildExportFilename("json"));
  }, [doc, meta, draftId, draftName, deriveDefaultName, triggerDownload, buildExportFilename]);

  const onExportPdf = useCallback(async () => {
    const { exportToPdf } = await import("@/lib/export/export-pdf");
    // The exporter opens a print-preview popup and triggers
    // window.print() on its own — no blob download is issued. User then
    // picks "Save as PDF" from the browser print dialog.
    await exportToPdf({
      doc,
      meta,
      name: draftName || deriveDefaultName(doc),
      draftId,
    });
  }, [doc, meta, draftId, draftName, deriveDefaultName]);

  const onExportDocx = useCallback(async () => {
    const { exportToDocx } = await import("@/lib/export/export-docx");
    const blob = await exportToDocx({
      doc,
      meta,
      name: draftName || deriveDefaultName(doc),
      draftId,
    });
    triggerDownload(blob, buildExportFilename("docx"));
  }, [
    doc,
    meta,
    draftId,
    draftName,
    deriveDefaultName,
    triggerDownload,
    buildExportFilename,
  ]);

  const onNewDraft = useCallback(() => {
    if (!confirm("Start a new 8D? Unsaved changes will be lost.")) return;
    setDoc(defaultDoc());
    setMeta({});
    setDraftId(null);
    setDraftName("");
    setLastSavedAt(null);
    setSavingState("idle");
    setTurns([]);
    apiHistoryRef.current = [];
  }, []);

  const onLoadDraft = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/drafts/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`load ${r.status}`);
      const body = (await r.json()) as {
        draft: {
          id: string;
          name: string;
          doc: EightDDoc;
          meta: FieldMetaMap;
          savedAt: string;
        };
      };
      setDoc(body.draft.doc);
      setMeta(body.draft.meta ?? {});
      setDraftId(body.draft.id);
      setDraftName(body.draft.name);
      setLastSavedAt(body.draft.savedAt);
      setSavingState("saved");
      setTurns([]);
      apiHistoryRef.current = [];
    } catch {
      /* ignore */
    }
  }, []);

  // Deep-link: /report/new?draft=<id> auto-loads that draft on mount so the
  // global DraftsRail can hand-off a click into the full editor. Guarded by
  // a ref so it only runs once per query value.
  const searchParams = useSearchParams();
  const deeplinkDraft = searchParams.get("draft");
  const lastDeeplinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deeplinkDraft) return;
    if (lastDeeplinkRef.current === deeplinkDraft) return;
    if (draftId === deeplinkDraft) return;
    lastDeeplinkRef.current = deeplinkDraft;
    void onLoadDraft(deeplinkDraft);
  }, [deeplinkDraft, draftId, onLoadDraft]);

  const displayedDraftName = draftName || deriveDefaultName(doc);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {contextHeader}
      <div className="flex flex-1 overflow-hidden">
        <ReportSidepanel
          collapsed={sidepanelCollapsed}
          onToggleCollapsed={toggleSidepanel}
          currentDraftId={draftId}
          currentDraftName={displayedDraftName}
          onSaveCurrent={onSaveCurrent}
          onExportCurrent={onExportCurrent}
          onExportPdf={onExportPdf}
          onExportDocx={onExportDocx}
          onNewDraft={onNewDraft}
          onLoadDraft={onLoadDraft}
          savingState={savingState}
          lastSavedAt={lastSavedAt}
        />
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
          <div className="min-h-0 border-zinc-200 dark:border-zinc-800 lg:border-r">
            <EightDEditor
              doc={doc}
              meta={meta}
              onField={onField}
              onAsk={onAsk}
              onAutoDraftAll={onAutoDraftAll}
              pendingPath={pendingPath}
              disabled={busy}
              busy={busy}
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
    </div>
  );
}
