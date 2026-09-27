import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: string; badge?: number };

/** iOS segmented control: gray track, white thumb on the selected segment. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("inline-flex min-h-9 rounded-[9px] bg-[var(--color-fill)] p-[2px]", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[13px] font-semibold transition",
              selected ? "bg-white text-black shadow-[0_3px_8px_rgba(0,0,0,0.12),0_1px_1px_rgba(0,0,0,0.04)]" : "text-[#3c3c43] hover:text-black",
            )}
          >
            {option.label}
            {option.badge ? <span className="rounded-full bg-[var(--color-danger)] px-1.5 text-[11px] font-bold leading-4 text-white">{option.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
