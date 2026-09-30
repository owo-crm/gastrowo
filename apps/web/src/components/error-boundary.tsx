import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportClientError } from "@/lib/error-reporting";
import { isStaleBuildError, reloadForNewBuild } from "@/lib/stale-build";

/** A crash in one screen shows a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isStaleBuildError(error) && reloadForNewBuild()) return;
    reportClientError(error.message, `${error.stack ?? ""}\n${info.componentStack ?? ""}`);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--color-bg)] px-6 text-center">
        <div className="max-w-sm">
          <p className="text-[22px] font-semibold text-black">Something went wrong</p>
          <p className="mt-2 text-[16px] text-[var(--color-text-muted)]">We've been notified. Reload the page to continue.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 min-h-12 rounded-full bg-[var(--color-primary-strong)] px-6 text-[17px] font-semibold text-white"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
