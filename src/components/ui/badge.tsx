import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 font-data text-[9px] uppercase tracking-[0.1em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-[var(--line-strong)] text-[var(--dim)]",
        accent:
          "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]",
        solid: "border-transparent bg-white/10 text-[var(--fg)]",
        warn: "border-[var(--faint)] text-[var(--fg)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
