import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { findActive, getNavSections } from "@/lib/navigation";
import type { MeResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A guided tour of the app on first sign-in: it opens each place in turn, highlights what matters
 * there and explains it in two lines. Owners and managers get the full 15 steps, workers a short one.
 * Replay it from Settings (the "platofy:start-tour" event).
 */

type TourStep = {
  /** i18n: tour.<id>.title / tour.<id>.body */
  id: string;
  /** Page to open first; none keeps the current page. */
  route?: string;
  /** CSS selector of what to highlight; none (or not found) shows the card in the middle. */
  target?: string;
};

const MANAGER_STEPS: TourStep[] = [
  { id: "welcome" },
  { id: "locations", route: "/team/locations", target: "main section" },
  { id: "positions", route: "/team/positions", target: "main section" },
  { id: "invites", route: "/team/invites", target: "main section" },
  { id: "people", route: "/team", target: "main ul" },
  { id: "templates", route: "/team/templates", target: "main section" },
  { id: "availability", route: "/schedule/availability", target: "main section" },
  { id: "build_week", route: "/schedule", target: "[data-tour=schedule-actions]" },
  { id: "grid", route: "/schedule", target: "[role=grid]" },
  { id: "requests", route: "/schedule/requests", target: "main section" },
  { id: "hours", route: "/schedule/hours", target: "main" },
  { id: "time_clock", route: "/settings/business", target: "[data-tour=time-clock]" },
  { id: "overview", route: "/overview", target: "[data-tour=kpis]" },
  { id: "payroll", route: "/payroll", target: "main section" },
  { id: "finish", target: "[data-tour=bell]" },
];

const STAFF_STEPS: TourStep[] = [
  { id: "staff_welcome" },
  { id: "staff_home", route: "/schedule", target: "[data-testid=home-card]" },
  { id: "staff_week", route: "/schedule", target: "main li" },
  { id: "staff_availability", route: "/schedule/availability", target: "main section" },
  { id: "staff_requests", route: "/schedule/requests", target: "main section" },
  { id: "staff_tasks", route: "/tasks", target: "main" },
  { id: "staff_settings", route: "/settings", target: "main section" },
  { id: "staff_finish", target: "[data-tour=bell]" },
];

const START_EVENT = "platofy:start-tour";
const doneKey = (userId: string) => `platofy.tour-done.${userId}`;

/** Replays the tour (Settings → Take the tour). */
export function startProductTour() {
  window.dispatchEvent(new Event(START_EVENT));
}

function readDone(userId: string): boolean {
  try {
    return localStorage.getItem(doneKey(userId)) === "1";
  } catch {
    return true; // No storage: don't nag on every page load.
  }
}

function markDone(userId: string) {
  try {
    localStorage.setItem(doneKey(userId), "1");
  } catch {
    // ignore
  }
}

/** The steps this person can actually open (plan and permissions decide which pages exist). */
function stepsFor(me: MeResponse): TourStep[] {
  const sections = getNavSections(me);
  const steps = me.role === "STAFF" ? STAFF_STEPS : MANAGER_STEPS;
  // Owners end the tour on their "Get started" roadmap; everyone else on the notifications bell.
  const hasRoadmap = Boolean(findActive(sections, "/start"));
  return steps
    .map((step) => (step.id === "finish" && hasRoadmap ? { id: "finish_roadmap", route: "/start", target: "[data-testid=roadmap]" } : step))
    .filter((step) => !step.route || Boolean(findActive(sections, step.route)));
}

type Rect = { top: number; left: number; width: number; height: number };

function visibleElement(selector: string): HTMLElement | null {
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

export function ProductTour() {
  const { me } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  const steps = useMemo(() => (me ? stepsFor(me) : []), [me]);
  const step = index === null ? null : steps[index] ?? null;
  const inApp =
    !["/", "/login", "/join", "/kiosk", "/demo", "/pending-link", "/how-it-works", "/terms", "/privacy", "/cookies"].includes(location.pathname) &&
    !location.pathname.startsWith("/tools") &&
    !location.pathname.startsWith("/compare");

  // First sign-in: start once the app has rendered. Replays come from Settings.
  useEffect(() => {
    if (!me?.id || !me.is_linked || !inApp || index !== null || readDone(me.id)) return;
    const timer = window.setTimeout(() => setIndex(0), 900);
    return () => window.clearTimeout(timer);
  }, [me?.id, me?.is_linked, inApp, index]);
  useEffect(() => {
    const start = () => setIndex(0);
    window.addEventListener(START_EVENT, start);
    return () => window.removeEventListener(START_EVENT, start);
  }, []);

  const close = useCallback(() => {
    if (me?.id) markDone(me.id);
    setIndex(null);
    setRect(null);
  }, [me?.id]);

  // Open the step's page, then find, scroll to and measure what it points at.
  useLayoutEffect(() => {
    if (!step) return;
    if (step.route && location.pathname !== step.route) {
      setRect(null);
      navigate(step.route);
      return;
    }
    if (!step.target) {
      setRect(null);
      return;
    }
    let cancelled = false;
    let tries = 0;
    let element: HTMLElement | null = null;
    const measure = () => {
      if (!element || cancelled) return;
      const box = element.getBoundingClientRect();
      // Clamp tall targets to the screen so the highlight stays visible.
      const top = Math.max(8, box.top);
      const bottom = Math.min(window.innerHeight - 8, box.bottom);
      const left = Math.max(8, box.left);
      const right = Math.min(window.innerWidth - 8, box.right);
      setRect({ top, left, width: Math.max(40, right - left), height: Math.max(40, bottom - top) });
    };
    const find = () => {
      if (cancelled) return;
      element = visibleElement(step.target!);
      if (!element) {
        tries += 1;
        if (tries < 25) window.setTimeout(find, 120);
        else setRect(null);
        return;
      }
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      window.setTimeout(measure, 380);
    };
    find();
    const onChange = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      measure();
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [step, location.pathname, navigate]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") setIndex((current) => (current === null ? current : Math.min(current + 1, steps.length - 1)));
      if (event.key === "ArrowLeft") setIndex((current) => (current === null ? current : Math.max(current - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, close, steps.length]);

  if (!step || index === null || !me) return null;

  const last = index === steps.length - 1;
  const phone = viewport.width < 640;
  const cardWidth = Math.min(380, viewport.width - 32);
  const pad = 6;
  // Card placement: under the highlight when there is room, else above; phones dock it at the bottom.
  let cardStyle: React.CSSProperties;
  if (phone || !rect) {
    cardStyle = phone
      ? { left: 16, right: 16, bottom: 96 }
      : { left: "50%", top: "50%", width: cardWidth, transform: "translate(-50%, -50%)" };
  } else {
    const left = Math.min(Math.max(16, rect.left), viewport.width - cardWidth - 16);
    const below = rect.top + rect.height + pad + 14;
    cardStyle =
      below + 240 < viewport.height
        ? { left, top: below, width: cardWidth }
        : rect.top - pad - 14 > 240
          ? { left, bottom: viewport.height - rect.top + pad + 14, width: cardWidth }
          : { left: Math.max(16, viewport.width - cardWidth - 24), bottom: 24, width: cardWidth };
  }

  return createPortal(
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-label={t(`tour.${step.id}.title`)}>
      {/* Clicks outside the card do nothing: the tour moves only with its own buttons. */}
      <div className={cn("absolute inset-0", !rect && "bg-[rgba(15,23,42,0.55)]")} />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-[16px] transition-all duration-300 ease-out"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.55), 0 0 0 3px rgba(255,255,255,0.9)",
          }}
          data-tour-highlight
        />
      ) : null}
      <div className="absolute rounded-[20px] bg-white p-5 text-black shadow-[0_24px_60px_rgba(0,0,0,0.3)]" style={cardStyle} data-tour-card>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-[var(--color-primary-strong)]">{t("tour.step", { current: index + 1, total: steps.length })}</span>
          <button type="button" onClick={close} className="inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--color-text-muted)]">
            {t("tour.skip")} <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-[19px] font-semibold leading-6">{t(`tour.${step.id}.title`)}</p>
        <p className="mt-1.5 text-[15px] leading-[21px] text-[#3c3c43]">{t(`tour.${step.id}.body`)}</p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--color-fill)]">
          <div className="h-full rounded-full bg-[var(--color-primary-strong)] transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={() => setIndex(index - 1)} disabled={index === 0}>
            <ArrowLeft className="size-4" /> {t("tour.back")}
          </Button>
          <Button size="sm" onClick={() => (last ? close() : setIndex(index + 1))}>
            {last ? t("tour.finish") : index === 0 ? t("tour.start") : t("tour.next")} {last ? null : <ArrowRight className="size-4" />}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
