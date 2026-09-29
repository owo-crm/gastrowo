import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

import { Button } from "@/components/ui/button";

/**
 * Stops in-app navigation (and asks the browser on tab close) while `dirty` is true.
 * Render <UnsavedDialog> when `blocker.state === "blocked"`, then call proceed() or reset().
 */
export function useUnsavedChangesBlocker(dirty: boolean) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return blocker;
}

export function UnsavedDialog({
  open,
  title,
  body,
  saveLabel,
  discardLabel,
  cancelLabel,
  saving,
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  saveLabel: string;
  discardLabel: string;
  cancelLabel: string;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/40 px-6" role="alertdialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="w-full max-w-[340px] overflow-hidden rounded-[22px] bg-white text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="px-5 pb-4 pt-5">
          <p className="text-[17px] font-semibold text-black">{title}</p>
          <p className="mt-1.5 text-[15px] leading-5 text-[var(--color-text-muted)]">{body}</p>
        </div>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <Button size="lg" onClick={onSave} disabled={saving}>
            {saveLabel}
          </Button>
          <Button size="lg" variant="secondary" onClick={onDiscard} disabled={saving}>
            {discardLabel}
          </Button>
          <Button size="lg" variant="plain" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
