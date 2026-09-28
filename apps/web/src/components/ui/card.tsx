import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/** A white rounded island on the gray background, like an iOS inset grouped section. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("ios-island mb-4 px-4 py-5 text-[var(--color-text)] sm:px-5", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 min-w-0 items-start justify-between gap-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("min-w-0 break-words text-[20px] font-semibold leading-tight tracking-[-0.02em] text-black", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-0.5 min-w-0 break-words text-[14px] leading-5 text-[var(--color-text-muted)]", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-3", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 flex items-center gap-2", className)} {...props} />;
}
