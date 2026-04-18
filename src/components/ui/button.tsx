import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button variants follow DESIGN.md:
 * - default  → dark near-black CTA (#1e1f23), amber-on-hover via opacity shift
 * - outline  → parchment card with sage border, orange hover text
 * - ghost    → invisible until hover, then orange flash
 * - subtle   → light sage surface, orange hover
 * - feature  → warm-tan surface with gold border — reserved for premium CTAs
 */
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium",
    "transition-colors focus-visible:outline-none focus-visible:ring-2",
    "focus-visible:ring-[color:var(--color-focus-blue)]/60 focus-visible:ring-offset-1",
    "focus-visible:ring-offset-parchment",
    "disabled:pointer-events-none disabled:opacity-50",
  ),
  {
    variants: {
      variant: {
        default: "btn-cta-dark hover:shadow-sm",
        outline:
          "border border-sage-border bg-parchment text-olive-ink hover-orange hover:bg-hover-bg",
        ghost: "bg-transparent text-olive-ink hover-orange hover:bg-hover-bg",
        subtle:
          "bg-light-sage text-olive-ink hover-orange hover:bg-hover-bg border border-transparent",
        feature:
          "bg-warm-tan text-deep-olive ring-1 ring-inset ring-[color:var(--color-gold-border)] hover-orange",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
