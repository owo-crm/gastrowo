import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Check, Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";
import { api } from "@/lib/api";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import type { SeoFaq } from "@/lib/seo-pages";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Header, footer and building blocks shared by the public marketing pages (tools, comparisons). */

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-5xl px-4 sm:px-6", className)}>{children}</div>;
}

export function SignupButton({ context, className, children = "Start free" }: { context: string; className?: string; children?: ReactNode }) {
  return (
    <Link
      to="/login?mode=onboarding"
      onClick={() => trackMarketingEvent("signup_cta_click", { context, page: window.location.pathname })}
      className={cn(
        "inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary-strong)] px-6 text-[17px] font-semibold text-white transition hover:bg-[var(--color-primary-pressed)] active:opacity-70",
        className,
      )}
    >
      {children}
    </Link>
  );
}

const TOOL_LINKS = [
  { to: "/tools/restaurant-schedule-template", label: "Schedule template" },
  { to: "/tools/labor-cost-calculator", label: "Labor cost calculator" },
  { to: "/tools/overtime-calculator", label: "Overtime calculator" },
  { to: "/tools/tip-pool-calculator", label: "Tip pool calculator" },
  { to: "/tools/food-cost-calculator", label: "Food cost calculator" },
  { to: "/tools/menu-price-calculator", label: "Menu price calculator" },
  { to: "/tools/prime-cost-calculator", label: "Prime cost calculator" },
  { to: "/tools/restaurant-break-even-calculator", label: "Break-even calculator" },
  { to: "/tools/time-card-calculator", label: "Time card calculator" },
];

const NAV = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/#features", label: "Features" },
  { to: "/#pricing", label: "Pricing" },
  { to: "/tools", label: "Free tools" },
  { to: "/#faq", label: "FAQ" },
];

const NAV_PL = [
  { to: "/pl#features", label: "Funkcje" },
  { to: "/pl#pricing", label: "Cennik" },
  { to: "/pl#faq", label: "Pytania" },
];

/**
 * One header for every public page (landing, How it works, tools, comparisons), so the menu is the
 * same everywhere. Section links point at the landing page ("/#pricing"); the landing scrolls to them.
 */
export function MarketingHeader() {
  const { pathname, hash } = useLocation();
  const [open, setOpen] = useState(false);
  const polish = useLanguage().lang === "pl";
  const nav = polish ? NAV_PL : NAV;
  const active = (to: string) => {
    const [path, anchor] = to.split("#");
    if (anchor) return pathname === path && hash === `#${anchor}`;
    return pathname === path || pathname.startsWith(`${path}/`);
  };
  return (
    <header className="ios-bar sticky top-0 z-30 border-b border-[var(--color-separator)]">
      <Container className="flex h-14 items-center justify-between gap-3">
        <Link to={polish ? "/pl" : "/"} className="shrink-0" aria-label="Platofy" onClick={() => setOpen(false)}>
          <BrandLogo kind="wordmark" className="text-[1.8rem]" />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-6 text-[15px] font-medium">
            {nav.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active(item.to) ? "page" : undefined}
                  className={cn("transition hover:text-black", active(item.to) ? "text-black" : "text-[var(--color-text-muted)]")}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/login?mode=signin" className="px-1 text-[15px] font-semibold text-[var(--color-primary-strong)]">
            {polish ? "Zaloguj się" : "Sign in"}
          </Link>
          <SignupButton context="header" className="min-h-9 rounded-full px-4 text-[15px]">
            {polish ? "Zacznij za darmo" : "Start free"}
          </SignupButton>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-9 place-items-center rounded-full text-black md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </Container>
      {open ? (
        <nav aria-label="Main" className="border-t border-[var(--color-separator)] bg-white md:hidden">
          <ul className="mx-auto max-w-5xl px-4 py-2">
            {nav.map((item) => (
              <li key={item.to}>
                <Link to={item.to} onClick={() => setOpen(false)} className="flex min-h-12 items-center border-b border-[var(--color-separator)] text-[17px] font-medium text-black last:border-0">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

/** Scroll to "#section" after navigating to a page (the router doesn't do it for us). */
export function useScrollToHash() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    let tries = 0;
    const find = () => {
      const element = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (tries++ < 20) window.setTimeout(find, 50);
    };
    find();
  }, [hash, pathname]);
}

export function MarketingShell({ children }: { children: ReactNode }) {
  useScrollToHash();
  return (
    <div className="min-h-dvh overflow-x-clip bg-white text-black">
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--color-separator)] bg-[var(--color-grouped)] py-10">
      <Container className="grid gap-8 text-[14px] text-[var(--color-text-muted)] sm:grid-cols-3">
        <div className="space-y-3">
          <BrandLogo kind="wordmark" className="text-[1.5rem]" />
          <p>Scheduling, time clock and payroll export for restaurants.</p>
          <a href="mailto:support@platofy.app" className="block hover:text-black">support@platofy.app</a>
        </div>
        <div>
          <p className="mb-2 font-semibold text-black">Free tools</p>
          <ul className="space-y-1.5">
            {TOOL_LINKS.map((link) => (
              <li key={link.to}><Link to={link.to} className="hover:text-black">{link.label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-black">Platofy</p>
          <ul className="space-y-1.5">
            <li><Link to="/how-it-works" className="hover:text-black">How it works</Link></li>
            <li><Link to="/demo" className="hover:text-black">Live demo</Link></li>
            <li><Link to="/switch" className="hover:text-black">Free switch-over</Link></li>
            <li><Link to="/compare/7shifts" className="hover:text-black">vs 7shifts</Link> · <Link to="/compare/homebase" className="hover:text-black">vs Homebase</Link> · <Link to="/compare/when-i-work" className="hover:text-black">vs When I Work</Link></li>
            <li><a href="/#pricing" className="hover:text-black">Pricing</a></li>
            <li><Link to="/terms" className="hover:text-black">Terms</Link> · <Link to="/privacy" className="hover:text-black">Privacy</Link></li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}

export function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children?: ReactNode }) {
  return (
    <section className="pb-8 pt-12 sm:pt-16">
      <Container>
        <p className="text-[14px] font-bold uppercase tracking-[0.08em] text-[var(--color-primary-strong)]">{eyebrow}</p>
        <h1 className="mt-2 max-w-3xl text-[36px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[52px]">{title}</h1>
        <p className="mt-4 max-w-2xl text-[18px] leading-7 text-[var(--color-text-muted)]">{intro}</p>
        {children}
      </Container>
    </section>
  );
}

export function Faq({ items }: { items: SeoFaq[] }) {
  if (!items.length) return null;
  return (
    <section className="py-10">
      <Container>
        <h2 className="text-[28px] font-bold tracking-[-0.02em]">Frequently asked questions</h2>
        <div className="mt-5 divide-y divide-[var(--color-separator)] rounded-[20px] bg-[var(--color-grouped)]">
          {items.map((item) => (
            <details key={item.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                <h3 className="text-[17px] font-semibold">{item.q}</h3>
                <span className="text-[22px] text-[var(--color-primary-strong)] transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-[16px] leading-6 text-[var(--color-text-muted)]">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** The "stop doing this by hand" pitch at the bottom of every tool. */
export function PlatofyCta({ context, title, body }: { context: string; title: string; body: string }) {
  return (
    <section className="py-8">
      <Container>
        <div className="rounded-[28px] bg-[radial-gradient(900px_500px_at_10%_0%,#3b7bff,#1f5bd6_60%,#1646a8)] px-6 py-10 text-white sm:px-10">
          <h2 className="max-w-2xl text-[28px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[36px]">{title}</h2>
          <p className="mt-3 max-w-2xl text-[17px] leading-7 text-white/85">{body}</p>
          <ul className="mt-5 grid gap-2 text-[16px] sm:grid-cols-2">
            {["Builds the week from availability", "Swaps and time off on every phone", "Tablet or phone time clock", "Approved hours to payroll"].map((item) => (
              <li key={item} className="flex items-center gap-2"><Check className="size-5 shrink-0" strokeWidth={3} /> {item}</li>
            ))}
          </ul>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/login?mode=onboarding"
              onClick={() => trackMarketingEvent("signup_cta_click", { context, page: window.location.pathname })}
              className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[12px] bg-white px-6 text-[17px] font-semibold text-black"
            >
              Start free <ArrowRight className="size-5" />
            </Link>
            <Link to="/demo" className="inline-flex min-h-[50px] items-center justify-center rounded-[12px] bg-white/15 px-6 text-[17px] font-semibold text-white">
              Try the live demo
            </Link>
          </div>
          <p className="mt-3 text-[14px] text-white/75">Free for one location and up to 15 people · 30 days of Pro, no card</p>
        </div>
      </Container>
    </section>
  );
}

/** Email capture: stores a lead and (for the template) emails the files. */
export function LeadForm({
  kind,
  source,
  button,
  done,
  className,
}: {
  kind: "template" | "calculator";
  source: string;
  button: string;
  done: string;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState("sending");
    try {
      await api.submitLead({ email, kind, source, website: trap });
      trackMarketingEvent("lead_submitted", { kind, source });
      setState("done");
    } catch {
      setState("error");
    }
  };
  if (state === "done") {
    return <p className={cn("flex items-center gap-2 text-[16px] font-semibold text-[var(--color-success)]", className)}><Check className="size-5" /> {done}</p>;
  }
  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-2 sm:flex-row", className)}>
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@restaurant.com"
        aria-label="Email"
        className="min-h-[50px] flex-1 rounded-[12px] bg-[var(--color-fill)] px-4 text-[17px] outline-none focus:ring-2 focus:ring-[var(--color-primary-strong)]"
      />
      <input tabIndex={-1} autoComplete="off" aria-hidden value={trap} onChange={(event) => setTrap(event.target.value)} name="website" className="hidden" />
      <button type="submit" disabled={state === "sending"} className="min-h-[50px] rounded-[12px] bg-black px-5 text-[17px] font-semibold text-white disabled:opacity-60">
        {state === "sending" ? "Sending…" : button}
      </button>
      {state === "error" ? <p className="text-[14px] text-[var(--color-danger)] sm:self-center">Couldn't send. Try again.</p> : null}
    </form>
  );
}

/** A labelled number input for the calculators. */
export function NumberField({ label, value, onChange, prefix, suffix, step = "any", min = 0 }: { label: string; value: string; onChange: (value: string) => void; prefix?: string; suffix?: string; step?: string; min?: number }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-semibold text-[var(--color-text-muted)]">{label}</span>
      <span className="flex min-h-[48px] items-center rounded-[12px] bg-[var(--color-fill)] px-3 focus-within:ring-2 focus-within:ring-[var(--color-primary-strong)]">
        {prefix ? <span className="mr-1 text-[var(--color-text-muted)]">{prefix}</span> : null}
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 bg-transparent text-[17px] tabular-nums outline-none"
        />
        {suffix ? <span className="ml-1 whitespace-nowrap text-[var(--color-text-muted)]">{suffix}</span> : null}
      </span>
    </label>
  );
}

export const usd = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
export const num = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
