import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold tracking-tight",
  {
    variants: {
      variant: {
        /** Dark CTA chip — solid near-black, white text */
        default:
          "border-transparent bg-cta-dark text-parchment",
        /** Sage surface chip — low-emphasis labels */
        secondary:
          "border-transparent bg-light-sage text-deep-olive",
        /** Outlined chip on light surfaces */
        outline:
          "border-sage-border bg-parchment text-muted-olive",
        /** Error / critical — warm red, still warm */
        destructive: "border-transparent bg-[#b8261f] text-white",
        /** Warning — brand amber */
        warning:
          "border-transparent bg-[color:var(--color-brand-amber)] text-deep-olive",
        /** Success — sage-compatible green */
        success: "border-transparent bg-emerald-600 text-white",
        /** Brand chip — warm tan featured */
        brand:
          "border border-[color:var(--color-gold-border)]/60 bg-warm-tan text-deep-olive",
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
