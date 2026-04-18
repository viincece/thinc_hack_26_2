"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type TocItem = {
  id: string;           // id of the <section> on the page
  label: string;
  num: number;
};

const COLLAPSE_KEY = "s3:report-toc-collapsed";

/**
 * Fixed right-rail table of contents for the incident-report page.
 *
 * - Anchor links (`#section-<N>`) jump to each card.
 * - IntersectionObserver tracks which section is in view and highlights
 *   it.
 * - Collapsible to a narrow icon strip; preference persists to
 *   localStorage so the layout stays predictable between visits.
 */
export function ReportToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    const elements = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (!elements.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        // Pick the most "on-screen" entry — handy when two sections are
        // visible at once; the one occupying more of the viewport wins.
        let best: IntersectionObserverEntry | null = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        }
        if (best) setActive(best.target.id);
      },
      {
        // Trigger in the top third of the viewport so the chosen entry
        // aligns with where the reader is looking.
        rootMargin: "-10% 0px -60% 0px",
        threshold: [0, 0.1, 0.3, 0.6, 1],
      },
    );
    for (const el of elements) obs.observe(el);
    return () => obs.disconnect();
  }, [items]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Before hydration we render a stable collapsed stub so SSR and client
  // agree on markup and we avoid a mounting flash.
  const isCollapsed = hydrated ? collapsed : true;

  return (
    <nav
      aria-label="Report sections"
      className={cn(
        "fixed right-3 top-24 z-20 hidden lg:block",
        "rounded-lg border border-zinc-200 bg-white/90 p-1 shadow-sm backdrop-blur",
        "dark:border-zinc-800 dark:bg-zinc-950/80",
        isCollapsed ? "w-9" : "w-56",
      )}
    >
      <div className="flex items-center justify-between gap-1 px-1 py-0.5">
        {!isCollapsed ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            On this page
          </span>
        ) : (
          <span className="sr-only">On this page</span>
        )}
        <button
          type="button"
          onClick={toggle}
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title={isCollapsed ? "Expand table of contents" : "Collapse table of contents"}
        >
          {isCollapsed ? (
            <ChevronLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <ol className="space-y-0.5">
        {items.map((i) => {
          const isActive = i.id === active;
          return (
            <li key={i.id}>
              <a
                href={`#${i.id}`}
                title={`${i.num}. ${i.label}`}
                className={cn(
                  "flex items-center gap-2 rounded px-1.5 py-1 text-[11px] leading-tight transition-colors",
                  isActive
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
                  )}
                >
                  {i.num}
                </span>
                {!isCollapsed ? (
                  <span className="truncate">{i.label}</span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
