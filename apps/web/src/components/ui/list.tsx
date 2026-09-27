import type { HTMLAttributes, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** A plain iOS list: full-width rows separated by inset hairlines. */
export function ListSection({ header, footer, children, className }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-[var(--color-separator)]", className)}>
      {header ? <h3 className="ios-section-header px-4 pb-2 pt-5 sm:px-6">{header}</h3> : null}
      <ul className="divide-y divide-[var(--color-separator)] border-t border-[var(--color-separator)] [&>li]:pl-0">{children}</ul>
      {footer ? <p className="px-4 pb-4 pt-2 text-[13px] text-[var(--color-text-muted)] sm:px-6">{footer}</p> : null}
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
        <span className="block truncate text-[16px] text-black">{title}</span>
        {subtitle ? <span className="block truncate text-[14px] text-[var(--color-text-muted)]">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-[15px] text-[var(--color-text-muted)]">{trailing}</span> : null}
      {chevron ? <ChevronRight className="size-5 shrink-0 text-[#8e8e93]" aria-hidden /> : null}
    </>
  );
  return (
    <li className={cn("bg-white", className)} {...rest}>
      {onClick ? (
        <button type="button" onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--color-grouped)] active:bg-[var(--color-fill)] sm:px-6">
          {body}
        </button>
      ) : (
        <div className="flex min-h-[52px] items-center gap-3 px-4 py-2 sm:px-6">{body}</div>
      )}
    </li>
  );
}
