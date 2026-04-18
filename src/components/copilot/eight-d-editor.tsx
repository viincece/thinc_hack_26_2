"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SECTION_TITLES, SECTIONS, type Section } from "./types";

export function EightDEditor({
  sections,
  onChange,
  onAskFill,
  pendingSection,
  disabled,
}: {
  sections: Record<Section, string>;
  onChange: (s: Section, v: string) => void;
  onAskFill: (s: Section) => void;
  pendingSection: Section | null;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            8D Report
          </div>
          <div className="text-sm font-medium">Draft</div>
        </div>
        <div className="text-xs text-zinc-500">
          Auto-saved locally · not yet filed to wiki
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {SECTIONS.map((s) => {
          const isPending = pendingSection === s;
          return (
            <section
              key={s}
              className={cn(
                "rounded-lg border border-zinc-200 bg-white transition-colors dark:border-zinc-800 dark:bg-zinc-950",
                isPending && "border-amber-300 ring-2 ring-amber-200/60",
              )}
            >
              <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-2 dark:border-zinc-900">
                <div>
                  <span className="mr-2 text-xs font-semibold text-zinc-500">
                    {s}
                  </span>
                  <span className="text-sm font-medium">
                    {SECTION_TITLES[s]}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onAskFill(s)}
                  title={`Ask the co-pilot to draft ${s}`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Draft {s}
                </Button>
              </header>
              <textarea
                value={sections[s]}
                onChange={(e) => onChange(s, e.target.value)}
                placeholder={`Write ${SECTION_TITLES[s].toLowerCase()} or click "Draft ${s}"…`}
                className="block h-28 w-full resize-y rounded-b-lg bg-transparent px-4 py-3 text-sm leading-6 outline-none placeholder:text-zinc-400 focus:ring-0"
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
