import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-20 w-full rounded-xl2 border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-heading)] outline-none transition placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[color:rgba(47,111,237,0.18)] sm:min-h-24",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
