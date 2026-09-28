import { ApiError, apiAbsoluteUrl } from "@/lib/api";

/** Send browser crashes to the API log (and Sentry there, when configured). At most 10 per page load. */
let sent = 0;

export function reportClientError(message: string, stack?: string) {
  if (sent >= 10 || import.meta.env.DEV) return;
  sent += 1;
  try {
    void fetch(apiAbsoluteUrl("/client-errors"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 2000), stack: stack?.slice(0, 8000), url: window.location.pathname }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Reporting must never break the page.
  }
}

export function installErrorReporting() {
  window.addEventListener("error", (event) => reportClientError(event.message, event.error instanceof Error ? event.error.stack : undefined));
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    // Network hiccups and API refusals are shown to the user already; only report real crashes.
    if (reason instanceof ApiError || (reason instanceof Error && reason.message === "NETWORK_ERROR")) return;
    reportClientError(reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
  });
}
