import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--color-heading)] sm:min-h-7 sm:px-3 sm:text-xs sm:tracking-[0.08em]",
        className,
      )}
      {...props}
    />
  );
}
