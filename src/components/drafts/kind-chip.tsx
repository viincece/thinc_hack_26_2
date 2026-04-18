import { ClipboardCheck, ShieldAlert, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftKind } from "@/lib/drafts-kinds";

/**
 * Visual marker for the document kind of a saved draft.
 * 8D / FMEA / Analysis each get a distinct colour + icon so the rail
 * is scannable even before users read the filename.
 */
const KIND_META: Record<
  DraftKind,
  { icon: typeof ClipboardCheck; cls: string; label: string }
> = {
  "8D": {
    icon: ClipboardCheck,
    label: "8D",
    cls: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  FMEA: {
    icon: ShieldAlert,
    label: "FMEA",
    cls: "bg-violet-50 text-violet-800 ring-violet-200",
  },
  Analysis: {
    icon: LineChart,
    label: "Analysis",
    cls: "bg-amber-50 text-amber-800 ring-amber-200",
  },
};

export function DraftKindChip({
  kind,
  size = "sm",
  className,
}: {
  kind: DraftKind;
  size?: "xs" | "sm";
  className?: string;
}) {
  const meta = KIND_META[kind] ?? KIND_META["8D"];
  const Icon = meta.icon;
  const padding = size === "xs" ? "px-1 py-0 text-[9px]" : "px-1.5 py-0.5 text-[10px]";
  const iconSize = size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm font-semibold uppercase tracking-wider ring-1 ring-inset",
        meta.cls,
        padding,
        className,
      )}
      title={`${meta.label} draft`}
    >
      <Icon className={iconSize} />
      {meta.label}
    </span>
  );
}

export function draftKindMeta(kind: DraftKind) {
  return KIND_META[kind] ?? KIND_META["8D"];
}
