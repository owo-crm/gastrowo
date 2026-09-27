import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "blue" | "green" | "orange" | "red";

const tones: Record<Tone, string> = {
  neutral: "bg-[var(--color-fill)] text-black",
  blue: "bg-[var(--color-accent)] text-[var(--color-primary-strong)]",
  green: "bg-[var(--color-success-fill)] text-[var(--color-success)]",
  orange: "bg-[var(--color-warning-fill)] text-[var(--color-warning)]",
  red: "bg-[var(--color-danger-fill)] text-[var(--color-danger)]",
};

export function Badge({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex min-h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold", tones[tone], className)}
      {...props}
    />
  );
}
