import {
  Cpu,
  Factory,
  Boxes,
  Package,
  Users,
  HardHat,
  Puzzle,
  ClipboardList,
  FlaskConical,
  FileText,
  Lightbulb,
  MessageSquare,
  BookOpen,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

export const KIND_META: Record<
  string,
  { icon: LucideIcon; color: string; bg: string; ring: string; label: string }
> = {
  // Entity subkinds
  Part: { icon: Cpu, color: "text-sky-700", bg: "bg-sky-50", ring: "ring-sky-200", label: "Part" },
  Supplier: { icon: Factory, color: "text-violet-700", bg: "bg-violet-50", ring: "ring-violet-200", label: "Supplier" },
  Batch: { icon: Boxes, color: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200", label: "Batch" },
  Article: { icon: Package, color: "text-indigo-700", bg: "bg-indigo-50", ring: "ring-indigo-200", label: "Article" },
  Section: { icon: HardHat, color: "text-teal-700", bg: "bg-teal-50", ring: "ring-teal-200", label: "Section" },
  Line: { icon: HardHat, color: "text-sky-800", bg: "bg-sky-50", ring: "ring-sky-200", label: "Line" },
  Factory: { icon: Factory, color: "text-stone-700", bg: "bg-stone-50", ring: "ring-stone-200", label: "Factory" },
  Operator: { icon: Users, color: "text-pink-700", bg: "bg-pink-50", ring: "ring-pink-200", label: "Operator" },
  BomPosition: { icon: Puzzle, color: "text-cyan-700", bg: "bg-cyan-50", ring: "ring-cyan-200", label: "BOM pos" },
  DefectCode: { icon: ClipboardList, color: "text-rose-700", bg: "bg-rose-50", ring: "ring-rose-200", label: "Defect" },
  TestCode: { icon: FlaskConical, color: "text-lime-700", bg: "bg-lime-50", ring: "ring-lime-200", label: "Test" },
  Order: { icon: Boxes, color: "text-slate-700", bg: "bg-slate-50", ring: "ring-slate-200", label: "Order" },
  Product: { icon: Package, color: "text-zinc-700", bg: "bg-zinc-50", ring: "ring-zinc-200", label: "Product" },
  // Node-table labels
  Entity: { icon: Cpu, color: "text-sky-700", bg: "bg-sky-50", ring: "ring-sky-200", label: "Entity" },
  Concept: { icon: Lightbulb, color: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200", label: "Concept" },
  Observation: { icon: MessageSquare, color: "text-zinc-700", bg: "bg-zinc-50", ring: "ring-zinc-200", label: "Observation" },
  Report: { icon: FileText, color: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200", label: "Report" },
  Source: { icon: BookOpen, color: "text-neutral-700", bg: "bg-neutral-50", ring: "ring-neutral-200", label: "Source" },
};

export function kindMeta(kind: string) {
  return KIND_META[kind] ?? {
    icon: HelpCircle,
    color: "text-zinc-700",
    bg: "bg-zinc-50",
    ring: "ring-zinc-200",
    label: kind,
  };
}

export function KgIcon({
  kind,
  className = "h-4 w-4",
}: {
  kind: string;
  className?: string;
}) {
  const { icon: Icon, color } = kindMeta(kind);
  return <Icon className={`${color} ${className}`} />;
}

export function KgBadge({
  kind,
  subkind,
}: {
  kind: string;
  subkind?: string;
}) {
  const meta = kindMeta(subkind || kind);
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md ${meta.bg} px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.color} ring-1 ring-inset ${meta.ring}`}
    >
      <Icon className="h-3 w-3" />
      {subkind || meta.label}
    </span>
  );
}
