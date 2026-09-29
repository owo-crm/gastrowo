import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** File extension for a data URL or a plain link, so downloads open in the right app. */
function extensionFor(src: string): string {
  const match = /^data:image\/(\w+)/.exec(src);
  if (match) return match[1] === "jpeg" ? "jpg" : match[1];
  const path = src.split("?")[0];
  const dot = path.lastIndexOf(".");
  return dot > -1 ? path.slice(dot + 1) : "jpg";
}

/**
 * A thumbnail that opens the photo full screen with a download button.
 * Photos are stored as data URLs, which browsers refuse to open in a new tab, so they are shown in place.
 */
export function PhotoThumb({ src, name, className, alt = "" }: { src: string; name: string; className?: string; alt?: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label={t("photo.open")}
        className="shrink-0 rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary-strong)]"
      >
        <img src={src} alt={alt} className={cn("object-cover", className)} />
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-[220] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={t("photo.open")} onClick={() => setOpen(false)}>
              <div className="flex shrink-0 items-center justify-end gap-2 p-3" onClick={(event) => event.stopPropagation()}>
                <a
                  href={src}
                  download={`${name}.${extensionFor(src)}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-semibold text-black"
                >
                  <Download className="size-4" /> {t("photo.download")}
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("common.close")}
                  className="grid size-11 place-items-center rounded-full bg-white/15 text-white"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center p-3 pt-0">
                <img src={src} alt={alt} className="max-h-full max-w-full rounded-[8px] object-contain" onClick={(event) => event.stopPropagation()} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
