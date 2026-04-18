"use client";

import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { InitiativeDraft } from "./types";

export function InitiativeCard({
  draft,
  onConfirmed,
  onDismiss,
}: {
  draft: InitiativeDraft;
  onConfirmed: (actionId: string) => void;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "done">("draft");

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/initiatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error ?? "Create failed");
      setStatus("done");
      onConfirmed(body.row?.action_id ?? "PA-?");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex items-center gap-2">
        <Badge variant="success">Proposed initiative</Badge>
        <Badge variant="outline">{draft.action_type}</Badge>
        <div className="ml-auto text-xs text-zinc-500">
          {draft.product_id}
          {draft.defect_id ? ` · ${draft.defect_id}` : ""}
        </div>
      </div>
      <div className="mt-2 font-medium">{draft.title}</div>
      <div className="mt-1 whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">
        {draft.details}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
        <span>Owner: {draft.owner_user_id}</span>
        {draft.due_date ? <span>Due: {draft.due_date}</span> : null}
      </div>
      {error ? (
        <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        {status === "done" ? (
          <Badge variant="success">
            <Check className="mr-1 h-3 w-3" /> Filed
          </Badge>
        ) : (
          <>
            <Button size="sm" onClick={confirm} disabled={busy}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Confirm & create
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              <X className="h-3.5 w-3.5" />
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
