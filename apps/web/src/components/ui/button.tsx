import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-center text-sm font-semibold leading-tight whitespace-normal transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 sm:min-h-11 sm:px-4",
  {
    variants: {
      variant: {
        default:
          "border border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-white hover:bg-[#245fd1]",
        secondary: "border border-[var(--color-border)] bg-white text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]",
        ghost: "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]",
        danger:
          "border border-[color:var(--color-danger)]/35 bg-[color:var(--color-danger)] text-white hover:bg-[#df5555]",
      },
      size: {
        default: "h-auto min-h-11",
        sm: "h-auto min-h-10 px-3",
        lg: "h-auto min-h-12 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
