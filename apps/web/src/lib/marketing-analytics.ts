type TrackingPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    plausible?: (eventName: string, options?: { props?: Record<string, unknown> }) => void;
  }
}

export function trackMarketingEvent(eventName: string, payload: TrackingPayload = {}) {
  if (typeof window === "undefined") return;

  const normalizedPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

  window.dataLayer?.push({ event: eventName, ...normalizedPayload });
  window.gtag?.("event", eventName, normalizedPayload);
  window.plausible?.(eventName, { props: normalizedPayload });

  if (window.fbq) {
    window.fbq("trackCustom", eventName, normalizedPayload);
  }

  window.dispatchEvent(new CustomEvent("gastrostuff:marketing-event", { detail: { eventName, payload: normalizedPayload } }));
}
