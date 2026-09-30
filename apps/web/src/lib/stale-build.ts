/**
 * After a deploy, a tab that was already open still points at the previous build's files, which are
 * gone: opening a lazily loaded screen fails with "Failed to fetch dynamically imported module".
 * Loading the page again picks up the new build. Once per minute at most, so a real outage can't loop.
 */
const KEY = "platofy.stale-build-reload";

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message);
}

/** Reloads and returns true, unless it already did so in the last minute. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // No storage: still reload once; the page load resets this function anyway.
  }
  window.location.reload();
  return true;
}

export function installStaleBuildRecovery() {
  // Vite fires this when a lazy chunk or its CSS can't be preloaded.
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
