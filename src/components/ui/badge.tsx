import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900",
        secondary:
          "border-transparent bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50",
        outline:
          "border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300",
        destructive:
          "border-transparent bg-red-600 text-white dark:bg-red-500",
        warning:
          "border-transparent bg-amber-500 text-white dark:bg-amber-500/90",
        success:
          "border-transparent bg-emerald-600 text-white dark:bg-emerald-500",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export function severityVariant(
  severity: string | null | undefined,
): VariantProps<typeof badgeVariants>["variant"] {
  switch (severity) {
    case "critical":
      return "destructive";
    case "high":
      return "warning";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
    default:
      return "outline";
  }
}
