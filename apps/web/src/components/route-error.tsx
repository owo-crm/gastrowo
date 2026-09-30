import { useEffect } from "react";
import { useRouteError } from "react-router-dom";

import { reportClientError } from "@/lib/error-reporting";
import { isStaleBuildError, reloadForNewBuild } from "@/lib/stale-build";

/** Shown instead of the router's raw "Unexpected Application Error" page. */
export function RouteError() {
  const error = useRouteError();
  const stale = isStaleBuildError(error);

  useEffect(() => {
    if (stale && reloadForNewBuild()) return;
    const message = error instanceof Error ? error.message : String(error);
    reportClientError(message, error instanceof Error ? error.stack ?? "" : "");
  }, [error, stale]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--color-bg)] px-6 text-center">
      <div className="max-w-sm">
        <p className="text-[22px] font-semibold text-black">{stale ? "Platofy was just updated" : "Something went wrong"}</p>
        <p className="mt-2 text-[16px] text-[var(--color-text-muted)]">{stale ? "Reload the page to get the new version." : "We've been notified. Reload the page to continue."}</p>
        <button
          type="button"
          onClick={() => reloadForNewBuild() || window.location.reload()}
          className="mt-6 min-h-12 rounded-full bg-[var(--color-primary-strong)] px-6 text-[17px] font-semibold text-white"
        >
          Reload
        </button>
      </div>
    </main>
  );
}
