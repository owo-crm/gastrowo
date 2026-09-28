import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-24 w-full py-2.5 rounded-xl border-0 bg-[rgba(118,118,128,0.12)] px-3 text-[16px] text-black outline-none transition placeholder:text-[var(--color-text-tertiary)] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50 sm:text-[15px]",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
