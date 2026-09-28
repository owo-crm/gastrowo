import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type SelectOption = { label: string; value: string };

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  options: SelectOption[];
};

export function Select({ className, options, value, onChange, disabled, id, name }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({});
  const selected = options.find((option) => option.value === value) ?? options[0];

  const updateMenuPosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const estimatedMenuHeight = Math.min(options.length * 44 + 12, 260 + 12);
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const placeAbove = spaceBelow < estimatedMenuHeight && rect.top > spaceBelow;
    const maxHeight = Math.max(120, placeAbove ? rect.top - viewportPadding * 2 : spaceBelow - 4);
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      zIndex: 1200,
      maxHeight,
      top: placeAbove ? undefined : rect.bottom + 8,
      bottom: placeAbove ? window.innerHeight - rect.top + 8 : undefined,
    });
  }, [options.length]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const handleReposition = () => updateMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updateMenuPosition]);

  const handleSelect = (nextValue: string) => {
    setOpen(false);
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-name={name}
        disabled={disabled}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-3 rounded-xl bg-[rgba(118,118,128,0.12)] px-3 text-left text-[15px] text-black outline-none transition",
          "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "ring-2 ring-[var(--color-primary)]",
          className,
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{selected?.label ?? "Select option"}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-[var(--color-text-muted)] transition", open && "rotate-180")} />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="overflow-hidden rounded-2xl bg-white/90 p-1.5 shadow-[var(--shadow-float)] backdrop-blur-xl"
            >
              <div className="max-h-[inherit] overflow-y-auto">
                {options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[15px] transition",
                        "sm:min-h-11 min-h-10",
                        isSelected
                          ? "font-semibold text-[var(--color-primary-strong)] hover:bg-[var(--color-grouped)]"
                          : "text-black hover:bg-[var(--color-grouped)]",
                      )}
                      onClick={() => handleSelect(option.value)}
                    >
                      <span className="min-w-0 break-words">{option.label}</span>
                      {isSelected ? <Check className="size-4 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
