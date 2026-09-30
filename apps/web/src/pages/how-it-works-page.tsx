import { useEffect, type ReactNode } from "react";
import { ArrowRight, Check, Lightbulb } from "lucide-react";
import { Link } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";
import { type Lang, useLanguage } from "@/lib/i18n";
import { legalLinks } from "@/lib/legal-links";
import { MarketingHeader, useScrollToHash } from "@/components/marketing-shell";
import { cn } from "@/lib/utils";

/**
 * "How it works": the real app, step by step, with why each step matters to an owner.
 * Screenshots in /public/how come from the demo restaurant (Settings > Business > Demo restaurant).
 */

type Frame = "desktop" | "phone" | "tablet";
type Shot = { src: string; frame: Frame; alt: string; width: number; height: number };
type Step = { title: string; body: string; points: string[]; why: string; shots: Shot[] };
type Copy = {
  meta: { title: string; description: string };
  nav: { home: string; pricing: string; signIn: string; start: string };
  hero: { eyebrow: string; title: string; body: string };
  loop: string[];
  whyLabel: string;
  steps: Step[];
  final: { title: string; body: string; cta: string; note: string };
  legal: { terms: string; privacy: string; cookies: string };
};

// Desktop shots are cropped to the working area; the two with a dialog open keep the full window.
const FULL_WINDOW = new Set(["desk-shift-editor", "desk-import"]);
const shot = (name: string, frame: Frame, alt: string): Shot => {
  const size =
    frame === "phone" ? { width: 780, height: 1688 } : frame === "tablet" ? { width: 900, height: 1140 } : FULL_WINDOW.has(name) ? { width: 1920, height: 1200 } : { width: 1506, height: 1200 };
  return { src: `/how/${name}.jpg`, frame, alt, ...size };
};

const EN: Copy = {
  meta: {
    title: "How Platofy works — restaurant scheduling, time clock and payroll",
    description:
      "See the real Platofy app step by step: collect availability, build the week in minutes, clock in by phone or tablet, approve only the exceptions and export payroll hours.",
  },
  nav: { home: "Home", pricing: "Pricing", signIn: "Sign in", start: "Start free" },
  hero: {
    eyebrow: "How it works",
    title: "From availability to payroll, in one loop",
    body: "This is the real app, not a mock-up. Here's what a week looks like for the owner, the manager and the team — and why each step saves you time or money.",
  },
  loop: ["Set up", "Availability", "Schedule", "Team's phones", "Clock in", "Approve hours", "Labor & payroll"],
  whyLabel: "Why it matters",
  steps: [
    {
      title: "Set up in one sitting",
      body: "Add your positions and pay rates, then paste your team from a spreadsheet. Everyone gets an email invite, sets a password and lands in your restaurant with the right position and rate.",
      points: ["One person can work several positions, each with its own rate", "Import from Excel or Google Sheets — any column order", "Free for one location and up to 15 people"],
      why: "Most scheduling tools are abandoned during setup. Here the whole team is in before your coffee gets cold, so next week can already be built in Platofy.",
      shots: [shot("desk-positions", "desktop", "Positions and pay rates"), shot("desk-import", "desktop", "Importing the team from a spreadsheet")],
    },
    {
      title: "The team tells you when they can work",
      body: "Each person marks their days and hours for the week on their phone. You see the whole team at a glance — a green day is a day they're free — and approve it with one tap.",
      points: ["Days off are respected automatically", "Desired hours per week, per person", "Nothing to chase in group chats"],
      why: "\"Can you work Friday?\" texts disappear. The schedule starts from real availability, so fewer shifts get swapped or dropped later.",
      shots: [shot("phone-availability", "phone", "A worker's availability on the phone"), shot("desk-availability", "desktop", "The team's availability for the week")],
    },
    {
      title: "The week builds itself — you just adjust",
      body: "Platofy fills every shift from availability, positions and priorities, and keeps each person under 40 hours. The draft is invisible to the team until you publish. Tap any shift to see who's free, who has a conflict and who doesn't work that position.",
      points: ["Filled shifts, open shifts and labor cost update as you edit", "Your pick always wins — even on a day off", "Overnight shifts and several locations handled"],
      why: "Owners tell us the weekly schedule takes 2–3 hours. Here it's about 15 minutes, and overtime is flagged before you publish.",
      shots: [shot("desk-draft", "desktop", "The draft week with filled and open shifts"), shot("desk-shift-editor", "desktop", "Choosing who works a shift")],
    },
    {
      title: "Everyone gets it on their phone",
      body: "When you publish, the team gets a push notification. Each person sees their week, who's working with them, and can ask to swap or pick up a shift. You approve in one tap.",
      points: ["Installs on the Home Screen — no app store", "Push notifications for new schedules, swaps and tasks", "Tasks with photo proof, like a shared to-do list"],
      why: "No more screenshots of a spreadsheet in a group chat, and no \"I didn't know I was on\". Swaps stay on the record, so the schedule is always the real one.",
      shots: [shot("phone-my-week", "phone", "A worker's week on the phone"), shot("phone-requests", "phone", "Approving a swap and a pickup")],
    },
    {
      title: "Clock in on the phone or the tablet",
      body: "Staff tap Start shift on their phone, or type a 4-digit PIN on a tablet by the door. Breaks are one tap too. You can require phone clock-ins to happen at the restaurant.",
      points: ["Phone, tablet, or both — your choice", "Breaks are subtracted from paid hours", "On-time punches are approved automatically"],
      why: "Hours come from real clock-ins, not memory at the end of the week. That's fewer disputes, fairer pay and a record you can trust.",
      shots: [shot("phone-on-the-clock", "phone", "On the clock, with a break button"), shot("tablet-kiosk", "tablet", "The PIN pad on a shared tablet")],
    },
    {
      title: "Approve only the exceptions",
      body: "Anything that matched the schedule is already approved. What's left — someone stayed late, came in without a shift — waits in Hours, grouped by day, with approve and reject right in the row.",
      points: ["Correct times in one tap", "Approve all at once when it looks right", "Every change is kept with who made it"],
      why: "Monday-morning hours checking goes from an hour to a couple of minutes, and nothing slips into payroll without a manager seeing it.",
      shots: [shot("phone-hours", "phone", "Hours waiting for approval"), shot("desk-hours", "desktop", "Hours grouped by day on desktop")],
    },
    {
      title: "Know your labor cost, run payroll",
      body: "Enter the day's sales and see labor as a share of revenue, per day and per location. Approved hours turn into payroll with a CSV for your accountant. Each person sees their own hours and pay.",
      points: ["Labor % against a 30% target", "Position rates calculated for you", "CSV export in US or Polish format"],
      why: "Labor is the biggest cost you control. Seeing it every day — not at the end of the month — is how restaurants keep it under 30%.",
      shots: [shot("desk-overview", "desktop", "Revenue, labor cost and labor %"), shot("desk-payroll", "desktop", "Payroll"), shot("phone-pay", "phone", "A worker's own pay")],
    },
  ],
  final: {
    title: "Try it with your own team this week",
    body: "Free for one location and up to 15 people. Paid plans from $26 a month, and Pro covers up to three locations — never per person.",
    cta: "Start free",
    note: "30-day Pro trial · no card",
  },
  legal: { terms: "Terms", privacy: "Privacy", cookies: "Cookies" },
};


const COPY: Record<Lang, Copy> = { en: EN };

function Framed({ shot: item }: { shot: Shot }) {
  // Tap to open the full-size screenshot (small screens show desktop shots scaled down).
  const image = (
    <a href={item.src} target="_blank" rel="noreferrer" className="block cursor-zoom-in" aria-label={item.alt}>
      <img src={item.src} alt={item.alt} width={item.width} height={item.height} loading="lazy" decoding="async" className="block h-auto w-full" />
    </a>
  );
  if (item.frame === "desktop") {
    return (
      <figure className="overflow-hidden rounded-[18px] bg-white shadow-[0_24px_60px_rgba(12,26,54,0.18)] ring-1 ring-black/5">
        <div className="flex h-8 items-center gap-1.5 border-b border-[#e5e5ea] bg-[#f6f6f8] px-3" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        {image}
        <figcaption className="sr-only">{item.alt}</figcaption>
      </figure>
    );
  }
  return (
    <figure
      className={cn(
        "mx-auto overflow-hidden bg-[#0c1a36] p-2 shadow-[0_24px_60px_rgba(12,26,54,0.25)]",
        item.frame === "phone" ? "w-full max-w-[280px] rounded-[40px]" : "w-full max-w-[340px] rounded-[32px]",
      )}
    >
      <div className={cn("overflow-hidden", item.frame === "phone" ? "rounded-[32px]" : "rounded-[24px]")}>{image}</div>
      <figcaption className="sr-only">{item.alt}</figcaption>
    </figure>
  );
}

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

function StepShots({ shots }: { shots: Shot[] }) {
  const desktops = shots.filter((item) => item.frame === "desktop");
  const devices = shots.filter((item) => item.frame !== "desktop");
  return (
    <div className="space-y-6">
      {desktops.map((item) => (
        <Framed key={item.src} shot={item} />
      ))}
      {devices.length ? (
        <div className={cn("grid items-start gap-6", devices.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {devices.map((item) => (
            <Framed key={item.src} shot={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HowItWorksPage() {
  const { lang } = useLanguage();
  useScrollToHash();
  const copy = COPY[lang] ?? EN;
  const links = legalLinks(lang);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = copy.meta.title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    const previousDescription = meta.content;
    meta.content = copy.meta.description;
    return () => {
      document.title = previousTitle;
      if (created) meta?.remove();
      else if (meta) meta.content = previousDescription;
    };
  }, [copy]);

  return (
    <div className="min-h-dvh overflow-x-clip bg-white text-black">
      <MarketingHeader />

      <main>
        <section className="pb-10 pt-14 sm:pt-20">
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-[15px] font-semibold uppercase tracking-[0.08em] text-[var(--color-primary-strong)]">{copy.hero.eyebrow}</p>
              <h1 className="mt-3 text-[38px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[56px]">{copy.hero.title}</h1>
              <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-8 text-[var(--color-text-muted)]">{copy.hero.body}</p>
            </div>
            <ol className="mx-auto mt-10 flex max-w-5xl flex-wrap justify-center gap-2">
              {copy.loop.map((label, index) => (
                <li key={label}>
                  <a href={`#step-${index + 1}`} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--color-grouped)] px-4 text-[15px] font-semibold text-black hover:bg-[var(--color-accent)]">
                    <span className="grid size-6 place-items-center rounded-full bg-[var(--color-primary-strong)] text-[13px] text-white">{index + 1}</span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        {copy.steps.map((step, index) => (
          <section key={step.title} id={`step-${index + 1}`} className={cn("scroll-mt-16 py-14 sm:py-20", index % 2 === 0 ? "bg-[var(--color-bg)]" : "bg-white")}>
            <Container className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
              <div className={cn(index % 2 === 1 && "lg:order-2")}>
                <p className="text-[15px] font-semibold text-[var(--color-primary-strong)]">
                  {index + 1} / {copy.steps.length}
                </p>
                <h2 className="mt-2 text-[30px] font-bold leading-tight tracking-[-0.02em] sm:text-[38px]">{step.title}</h2>
                <p className="mt-4 text-[17px] leading-7 text-[#3c3c43]">{step.body}</p>
                <ul className="mt-5 space-y-2.5">
                  {step.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-[16px] leading-6 text-black">
                      <Check className="mt-0.5 size-5 shrink-0 text-[var(--color-success)]" strokeWidth={3} />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 rounded-[18px] bg-[#fff4e8] px-5 py-4">
                  <p className="flex items-center gap-2 text-[14px] font-bold uppercase tracking-[0.06em] text-[#b25000]">
                    <Lightbulb className="size-4" /> {copy.whyLabel}
                  </p>
                  <p className="mt-1.5 text-[16px] leading-6 text-[#3d2a14]">{step.why}</p>
                </div>
              </div>
              <div className={cn(index % 2 === 1 && "lg:order-1")}>
                <StepShots shots={step.shots} />
              </div>
            </Container>
          </section>
        ))}

        <section className="bg-[var(--color-primary-strong)] py-16 text-white sm:py-20">
          <Container className="text-center">
            <h2 className="text-[32px] font-bold leading-tight tracking-[-0.02em] sm:text-[44px]">{copy.final.title}</h2>
            <p className="mx-auto mt-4 max-w-xl text-[18px] leading-7 text-white/85">{copy.final.body}</p>
            <Link
              to="/login?mode=onboarding"
              className="mt-8 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-white px-7 text-[17px] font-semibold text-[var(--color-primary-strong)]"
            >
              {copy.final.cta} <ArrowRight className="size-5" />
            </Link>
            <p className="mt-4 text-[15px] text-white/75">{copy.final.note}</p>
          </Container>
        </section>
      </main>

      <footer className="border-t border-[var(--color-separator)] py-8 text-[14px] text-[var(--color-text-muted)]">
        <Container className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/">{copy.nav.home}</Link>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to={links.terms}>{copy.legal.terms}</Link>
            <Link to={links.privacy}>{copy.legal.privacy}</Link>
            <Link to={links.cookies}>{copy.legal.cookies}</Link>
            <span>© 2026 Platofy</span>
          </div>
        </Container>
      </footer>
    </div>
  );
}
