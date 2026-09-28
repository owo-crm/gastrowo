import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * iOS button styles. default = filled tint, secondary = gray fill with black label,
 * tinted = light blue fill, ghost/plain = blue text only, danger = filled red.
 * Every label clears 4.5:1 on its own fill.
 */
const buttonVariants = cva(
  "inline-flex max-w-full select-none items-center justify-center gap-1.5 rounded-full text-center text-[15px] font-semibold leading-tight whitespace-normal transition-[background-color,opacity] duration-150 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-primary-strong)] text-white hover:bg-[var(--color-primary-pressed)]",
        secondary: "bg-[rgba(118,118,128,0.14)] text-black hover:bg-[rgba(118,118,128,0.2)]",
        tinted: "bg-[var(--color-accent)] text-[var(--color-primary-strong)] hover:bg-[#dae6fd]",
        ghost: "bg-transparent text-[var(--color-primary-strong)] hover:bg-[rgba(118,118,128,0.12)]",
        plain: "bg-transparent px-0 text-[var(--color-primary-strong)] hover:underline",
        danger: "bg-[var(--color-danger)] text-white hover:bg-[#b80012]",
        "danger-plain": "bg-transparent text-[var(--color-danger)] hover:bg-[var(--color-danger-fill)]",
        inverse: "bg-white text-black hover:bg-[var(--color-grouped)]",
      },
      size: {
        default: "min-h-11 px-5 py-2",
        sm: "min-h-9 px-4 py-1.5 text-[14px]",
        lg: "min-h-[52px] px-6 py-3 text-[17px]",
        icon: "size-11 p-0",
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
