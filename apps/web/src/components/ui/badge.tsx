import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 text-xs font-medium text-[var(--color-heading)]",
        className,
      )}
      {...props}
    />
  );
}
