import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl2 border border-[var(--color-border)] bg-white px-3 text-base text-[var(--color-heading)] outline-none transition placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[color:rgba(47,111,237,0.18)] sm:h-11 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
