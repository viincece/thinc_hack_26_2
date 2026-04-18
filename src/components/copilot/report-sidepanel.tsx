"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  FilePlus,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DraftSummary = {
  id: string;
  name: string;
  date: string;
  filename: string;
  updatedAt: string;
  problemPreview: string;
  articleName?: string;
  sizeBytes: number;
};

export function ReportSidepanel({
  collapsed,
  onToggleCollapsed,
  currentDraftId,
  currentDraftName,
  onSaveCurrent,
  onExportCurrent,
  onExportPdf,
  onExportDocx,
  onNewDraft,
  onLoadDraft,
  savingState,
  lastSavedAt,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  currentDraftId: string | null;
  currentDraftName: string;
  onSaveCurrent: (name: string) => Promise<void>;
  onExportCurrent: () => void;
  onExportPdf: () => Promise<void>;
  onExportDocx: () => Promise<void>;
  onNewDraft: () => void;
  onLoadDraft: (id: string) => Promise<void>;
  savingState: "idle" | "saving" | "saved" | "error";
  lastSavedAt: string | null;
}) {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftName, setDraftName] = useState(currentDraftName);
  const [exportBusy, setExportBusy] = useState<null | "pdf" | "docx">(null);
  const runExport = useCallback(
    async (kind: "pdf" | "docx") => {
      if (exportBusy) return;
      setExportBusy(kind);
      try {
        if (kind === "pdf") await onExportPdf();
        else await onExportDocx();
      } catch {
        /* errors surface via workspace */
      } finally {
        setExportBusy(null);
      }
    },
    [exportBusy, onExportPdf, onExportDocx],
  );
  const refreshSeq = useRef(0);

  useEffect(() => {
    setDraftName(currentDraftName);
  }, [currentDraftName]);

  const refresh = useCallback(async () => {
    const mySeq = ++refreshSeq.current;
    setLoading(true);
    try {
      const r = await fetch("/api/drafts", { cache: "no-store" });
      if (!r.ok) throw new Error(`list ${r.status}`);
      const body = (await r.json()) as { drafts: DraftSummary[] };
      if (refreshSeq.current === mySeq) setDrafts(body.drafts ?? []);
    } catch {
      // swallow — refresh is best-effort
    } finally {
      if (refreshSeq.current === mySeq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!collapsed) void refresh();
  }, [collapsed, refresh]);

  useEffect(() => {
    if (savingState === "saved") void refresh();
  }, [savingState, refresh]);

  const doDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this saved draft?")) return;
      try {
        const r = await fetch(`/api/drafts/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`delete ${r.status}`);
        await refresh();
      } catch {
        // ignore
      }
    },
    [refresh],
  );

  if (collapsed) {
    return (
      <div className="flex h-full w-10 flex-col items-center gap-2 border-r border-zinc-200 bg-zinc-50 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapsed}
          title="Expand sidepanel"
          className="h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewDraft}
          title="New draft"
          className="h-8 w-8"
        >
          <FilePlus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void onSaveCurrent(draftName)}
          title="Save draft"
          className="h-8 w-8"
        >
          {savingState === "saving" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void runExport("pdf")}
          disabled={!!exportBusy}
          title="Export PDF"
          className="h-8 w-8"
        >
          {exportBusy === "pdf" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void runExport("docx")}
          disabled={!!exportBusy}
          title="Export DOCX"
          className="h-8 w-8"
        >
          {exportBusy === "docx" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onExportCurrent}
          title="Export JSON"
          className="h-8 w-8"
        >
          <Download className="h-4 w-4" />
        </Button>
        <div className="mt-auto flex flex-col items-center text-[10px] text-zinc-400">
          <Folder className="h-4 w-4" />
          {drafts.length}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Workspace
          </div>
          <div className="text-sm font-medium">8D drafts</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapsed}
          title="Collapse sidepanel"
          className="h-7 w-7"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Current draft card */}
      <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
        <label className="mb-1 block text-[11px] font-medium text-zinc-500">
          Current draft name
        </label>
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="e.g. Motor controller — cold solder"
          className="mb-2 block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        />
        <div className="mb-2 flex items-center justify-between text-[10px] text-zinc-500">
          <span className="font-mono">{currentDraftId ?? "unsaved"}</span>
          {lastSavedAt ? (
            <span>
              saved {new Date(lastSavedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            onClick={() => void onSaveCurrent(draftName)}
            disabled={savingState === "saving"}
            className="h-7"
          >
            {savingState === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onNewDraft}
            className="h-7"
            title="Start a fresh 8D"
          >
            <FilePlus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Export
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={!!exportBusy}
              onClick={() => void runExport("pdf")}
              className="h-7"
              title="Export a clean PDF of the current draft"
            >
              {exportBusy === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!exportBusy}
              onClick={() => void runExport("docx")}
              className="h-7"
              title="Export a .docx of the current draft"
            >
              {exportBusy === "docx" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              DOCX
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onExportCurrent}
              className="h-7"
              title="Export the raw JSON draft"
            >
              <Download className="h-3.5 w-3.5" />
              JSON
            </Button>
          </div>
        </div>
        {savingState === "error" ? (
          <div className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-300">
            Save failed — check the server logs.
          </div>
        ) : null}
      </div>

      {/* Recent drafts list */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Recent ({drafts.length})
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => void refresh()}
          title="Refresh"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {drafts.length === 0 ? (
          <div className="px-2 py-4 text-center text-[11px] italic text-zinc-400">
            No saved drafts yet. Hit <b>Save</b> after drafting to persist this
            report.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {drafts.map((d) => {
              const active = d.id === currentDraftId;
              return (
                <li
                  key={d.id}
                  className={cn(
                    "group rounded-md border px-2 py-1.5 text-xs transition-colors",
                    active
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void onLoadDraft(d.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                      <span className="truncate font-medium">{d.name}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                      {d.id} · {d.date}
                    </div>
                    {d.problemPreview ? (
                      <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">
                        {d.problemPreview}
                      </div>
                    ) : null}
                  </button>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
                    <span className="truncate">{d.filename}</span>
                    <button
                      type="button"
                      className="invisible rounded p-0.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 group-hover:visible dark:hover:bg-red-950"
                      onClick={(e) => {
                        e.stopPropagation();
                        void doDelete(d.id);
                      }}
                      title="Delete draft"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-zinc-200 px-3 py-2 text-[10px] text-zinc-400 dark:border-zinc-800">
        Drafts are persisted under <code>/public/drafts</code>.
      </div>
    </div>
  );
}
