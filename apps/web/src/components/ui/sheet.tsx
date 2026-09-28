import { type ReactNode, useEffect, useId, useRef } from "react";
import { Check, X } from "lucide-react";

import { OverlayPortal } from "@/components/ui/overlay-portal";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SheetAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

/**
 * iOS 26 sheet: a bottom sheet on the phone and a centered panel on larger screens, on the gray
 * grouped background. A round ✕ on the left always closes it; the primary action is a blue pill
 * with a checkmark on the right. Esc and a tap outside close it too.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  action,
  cancelLabel,
  children,
  footer,
  size = "md",
  grouped = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: SheetAction;
  cancelLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Gray background with white islands inside, like iOS Settings. */
  grouped?: boolean;
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[140] flex items-end justify-center md:items-center md:p-6">
        <div className="ios-backdrop-enter absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "ios-sheet-enter relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] outline-none md:rounded-[28px] md:shadow-[var(--shadow-float)]",
            grouped ? "bg-[#f2f2f7]" : "bg-white",
            size === "sm" && "md:max-w-[420px]",
            size === "md" && "md:max-w-[560px]",
            size === "lg" && "md:max-w-[760px]",
          )}
        >
          <div className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-[#aeaeb2] md:hidden" aria-hidden />
          <header className="grid min-h-[60px] shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-3 pt-1">
            <CloseButton onClick={onClose} label={cancelLabel ?? (action ? t("common.cancel") : t("common.close"))} />
            <div className="min-w-0 text-center">
              <h2 id={titleId} className="truncate text-[17px] font-semibold tracking-[-0.02em] text-black">
                {title}
              </h2>
              {subtitle ? <p className="truncate text-[13px] text-[#3c3c43]">{subtitle}</p> : null}
            </div>
            {action ? (
              <button
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                aria-label={action.label}
                title={action.label}
                className={cn(
                  "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(31,91,214,0.35)] active:opacity-70 disabled:bg-[#c7c7cc] disabled:shadow-none",
                  action.destructive ? "bg-[var(--color-danger)]" : "bg-[var(--color-primary-strong)]",
                )}
              >
                <Check className="size-[18px]" strokeWidth={3} />
                <span className="max-sm:sr-only">{action.label}</span>
              </button>
            ) : (
              <span className="size-11" aria-hidden />
            )}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-2 sm:px-5">{children}</div>
          {footer ? <footer className="shrink-0 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer> : null}
        </div>
      </div>
    </OverlayPortal>
  );
}

/** The one close control used everywhere: dark X on a gray circle, easy to spot on white. */
export function CloseButton({ onClick, label, className }: { onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("grid size-11 place-items-center rounded-full active:opacity-60", className)}
    >
      <span className="grid size-9 place-items-center rounded-full bg-[rgba(118,118,128,0.16)] text-black">
        <X className="size-[18px]" strokeWidth={2.6} />
      </span>
    </button>
  );
}
