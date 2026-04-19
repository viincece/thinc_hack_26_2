"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ClipboardCheck,
  LineChart,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NewAnalysisDialog } from "@/components/reports/new-analysis-dialog";
import { NewFmeaDialog } from "@/components/fmea/new-fmea-dialog";

/**
 * The one place to start new work on every surface — dashboard hero,
 * drafts sidepanel, drafts rail. One `+ New` button that drops a menu
 * with the three creatable document kinds the app ships today:
 *
 *   - 8D report        → /report/new
 *   - FMEA draft       → NewFmeaDialog (article picker)
 *   - Incidence analysis → NewAnalysisDialog (draft picker)
 *
 * Keeps the three flows phrased the same way ("<Noun> · <one-line
 * purpose>") so the UX reads as a proper menu instead of three random
 * buttons with different verbs.
 */
export function NewItemMenu({
  size = "sm",
  variant = "default",
  className,
}: {
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "subtle";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<null | "fmea" | "analysis">(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside-click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = useCallback((k: "8d" | "fmea" | "analysis") => {
    setOpen(false);
    if (k === "fmea") setModal("fmea");
    else if (k === "analysis") setModal("analysis");
    // 8D is handled by the <Link> component so the browser navigates
    // natively and the menu closes on route change.
  }, []);

  return (
    <>
      <div ref={wrapRef} className={cn("relative inline-block", className)}>
        <Button
          size={size}
          variant={variant}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <Plus className="h-4 w-4" />
          New
          <ChevronDown className="h-3.5 w-3.5 opacity-80" />
        </Button>
        {open ? (
          <div
            role="menu"
            className={cn(
              "absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-md border border-sage-border bg-parchment shadow-lg",
            )}
          >
            <MenuItem
              icon={<ClipboardCheck className="h-4 w-4 text-emerald-600" />}
              title="8D report"
              caption="Reactive — from a concrete incident"
              href="/report/new"
              onClose={() => setOpen(false)}
            />
            <MenuItem
              icon={<ShieldAlert className="h-4 w-4 text-violet-600" />}
              title="FMEA draft"
              caption="Proactive — per article, walks the BOM"
              onClick={() => pick("fmea")}
            />
            <MenuItem
              icon={<LineChart className="h-4 w-4 text-amber-600" />}
              title="Incidence analysis"
              caption="Deep-dive — from a saved 8D draft"
              onClick={() => pick("analysis")}
            />
          </div>
        ) : null}
      </div>

      {modal === "fmea" ? (
        <NewFmeaDialog onClose={() => setModal(null)} />
      ) : null}
      {modal === "analysis" ? (
        <NewAnalysisDialog onClose={() => setModal(null)} />
      ) : null}
    </>
  );
}

function MenuItem({
  icon,
  title,
  caption,
  href,
  onClick,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
  href?: string;
  onClick?: () => void;
  onClose?: () => void;
}) {
  const body = (
    <div className="flex items-start gap-3 px-3 py-2 hover:bg-sage-cream">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-inset ring-sage-border">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-deep-olive">{title}</div>
        <div className="text-[11px] leading-4 text-muted-olive">{caption}</div>
      </div>
    </div>
  );
  if (href) {
    return (
      <Link
        role="menuitem"
        href={href}
        onClick={() => onClose?.()}
        className="block"
      >
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full text-left"
    >
      {body}
    </button>
  );
}
