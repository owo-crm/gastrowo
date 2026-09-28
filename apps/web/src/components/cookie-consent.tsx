import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "@/lib/i18n";
import { legalLinks } from "@/lib/legal-links";

/**
 * Ad measurement (Meta Pixel, Google Analytics) only loads after the visitor accepts it.
 * Without VITE_META_PIXEL_ID / VITE_GA_ID nothing is loaded and no banner is shown.
 */
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;
const STORAGE = "plato_cookie_consent";

function readConsent(): "granted" | "denied" | null {
  try {
    const value = localStorage.getItem(STORAGE);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

let loaded = false;
function loadMarketingScripts() {
  if (loaded) return;
  loaded = true;
  if (PIXEL_ID) {
    const w = window as unknown as Record<string, unknown>;
    const fbq = function (...args: unknown[]) {
      const self = fbq as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
      if (self.callMethod) self.callMethod(...args);
      else self.queue.push(args);
    } as unknown as ((...args: unknown[]) => void) & { queue: unknown[]; loaded: boolean; version: string; push: unknown };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.push = fbq;
    w.fbq = fbq;
    w._fbq = fbq;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
    fbq("init", PIXEL_ID);
    fbq("track", "PageView");
  }
  if (GA_ID) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = (...args: unknown[]) => {
      window.dataLayer!.push(args as unknown as Record<string, unknown>);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
  }
}

export function CookieConsent() {
  const { t, lang } = useLanguage();
  const enabled = Boolean(PIXEL_ID || GA_ID);
  const [consent, setConsent] = useState(readConsent);

  useEffect(() => {
    if (enabled && consent === "granted") loadMarketingScripts();
  }, [enabled, consent]);

  if (!enabled || consent) return null;

  const choose = (value: "granted" | "denied") => {
    try {
      localStorage.setItem(STORAGE, value);
    } catch {
      // Private mode: ask again next visit.
    }
    setConsent(value);
  };

  return (
    <div className="ios-glass fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[150] mx-auto max-w-xl rounded-[22px] px-4 py-4 sm:px-5" role="dialog" aria-label={t("consent.title")}>
      <p className="text-[15px] leading-5 text-black">
        {t("consent.body")}{" "}
        <Link to={legalLinks(lang).cookies} className="font-semibold text-[var(--color-primary-strong)]">
          {t("consent.more")}
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => choose("denied")} className="min-h-11 flex-1 rounded-full bg-[var(--color-fill)] text-[16px] font-semibold text-black">
          {t("consent.decline")}
        </button>
        <button type="button" onClick={() => choose("granted")} className="min-h-11 flex-1 rounded-full bg-[var(--color-primary-strong)] text-[16px] font-semibold text-white">
          {t("consent.accept")}
        </button>
      </div>
    </div>
  );
}
