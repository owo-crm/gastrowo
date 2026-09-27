import type { HTMLAttributes, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * iOS inset grouped list: a white rounded island on the gray background, rows separated by
 * hairlines inset from the leading edge, a sentence-case header above and a footer below.
 */
export function ListSection({ header, footer, children, className }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mb-6 px-4 sm:px-6", className)}>
      {header ? <h3 className="ios-section-header px-4 pb-2 pt-1">{header}</h3> : null}
      <ul className="ios-island [&>li+li]:relative [&>li+li]:before:absolute [&>li+li]:before:left-4 [&>li+li]:before:right-0 [&>li+li]:before:top-0 [&>li+li]:before:h-px [&>li+li]:before:scale-y-50 [&>li+li]:before:bg-[#c6c6c8]">{children}</ul>
      {footer ? <div className="px-4 pt-2 text-[13px] leading-[18px] text-[#3c3c43]">{footer}</div> : null}
    </section>
  );
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onClick,
  chevron,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLLIElement>, "title" | "onClick"> & {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] leading-[22px] tracking-[-0.02em] text-black">{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-[15px] leading-5 text-[#3c3c43]">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-[17px] text-[#3c3c43]">{trailing}</span> : null}
      {chevron ? <ChevronRight className="size-[18px] shrink-0 text-[#aeaeb2]" strokeWidth={2.5} aria-hidden /> : null}
    </>
  );
  return (
    <li className={cn("bg-white", className)} {...rest}>
      {onClick ? (
        <button type="button" onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-[#e5e5ea]">
          {body}
        </button>
      ) : (
        <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">{body}</div>
      )}
    </li>
  );
}

/** Settings-style colored icon tile. */
export function IconTile({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="grid size-[30px] place-items-center rounded-[8px] text-white [&_svg]:size-[18px]" style={{ backgroundColor: color }}>
      {children}
    </span>
  );
}
