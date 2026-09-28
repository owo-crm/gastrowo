import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border-0 bg-[rgba(118,118,128,0.12)] px-3 text-[16px] text-black outline-none transition placeholder:text-[var(--color-text-tertiary)] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50 sm:text-[15px]",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
