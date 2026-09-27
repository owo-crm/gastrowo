import { type ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

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
 * iOS sheet: a bottom sheet on the phone and a centered panel on larger screens.
 * The nav bar always has a clearly visible way out: a blue "Cancel" text button on the left, or a
 * dark X on a gray circle on the right when there is no primary action. Esc and a tap outside close it too.
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
            "ios-sheet-enter relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[14px] bg-white outline-none md:rounded-[14px] md:shadow-[var(--shadow-float)]",
            size === "sm" && "md:max-w-[420px]",
            size === "md" && "md:max-w-[560px]",
            size === "lg" && "md:max-w-[760px]",
          )}
        >
          <div className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-[#c7c7cc] md:hidden" aria-hidden />
          <header className="grid min-h-[52px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[var(--color-separator)] px-2">
            <div className="flex justify-start">
              {action ? (
                <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-2 text-[17px] text-[var(--color-primary-strong)] active:opacity-60">
                  {cancelLabel ?? t("common.cancel")}
                </button>
              ) : null}
            </div>
            <div className="min-w-0 text-center">
              <h2 id={titleId} className="truncate text-[17px] font-semibold text-black">
                {title}
              </h2>
              {subtitle ? <p className="truncate text-[13px] text-[var(--color-text-muted)]">{subtitle}</p> : null}
            </div>
            <div className="flex justify-end">
              {action ? (
                <button
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={cn(
                    "min-h-11 rounded-lg px-2 text-[17px] font-semibold active:opacity-60 disabled:opacity-35",
                    action.destructive ? "text-[var(--color-danger)]" : "text-[var(--color-primary-strong)]",
                  )}
                >
                  {action.label}
                </button>
              ) : (
                <CloseButton onClick={onClose} label={cancelLabel ?? t("common.close")} />
              )}
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
          {footer ? <footer className="shrink-0 border-t border-[var(--color-separator)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer> : null}
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
      <span className="grid size-[30px] place-items-center rounded-full bg-[var(--color-fill)] text-[#3c3c43]">
        <X className="size-[18px]" strokeWidth={2.6} />
      </span>
    </button>
  );
}
