import type { ReactNode } from "react";
import { MotionConfig, motion } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck2,
  Check,
  ChevronDown,
  Clock3,
  Facebook,
  FileSpreadsheet,
  Instagram,
  PieChart,
  Repeat2,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";
import { DevLoginButton } from "@/components/dev-login-button";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import { PRO_SEAT_PRICE_PLN, formatPln, plans } from "@/lib/plans";
import { cn } from "@/lib/utils";

const SIGNUP_URL = "/login?mode=onboarding";
const SIGNIN_URL = "/login?mode=signin";

const reveal = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
};

const navItems = [
  { href: "#funkcje", label: "Funkcje" },
  { href: "#cennik", label: "Cennik" },
  { href: "#faq", label: "FAQ" },
];

type Role = "cook" | "waiter" | "bar" | "manager";

const roleStyles: Record<Role, { label: string; chip: string; dot: string }> = {
  cook: { label: "Kuchnia", chip: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-400" },
  waiter: { label: "Sala", chip: "bg-sky-50 text-sky-800 border-sky-200", dot: "bg-sky-400" },
  bar: { label: "Bar", chip: "bg-violet-50 text-violet-800 border-violet-200", dot: "bg-violet-400" },
  manager: { label: "Manager", chip: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-400" },
};

const previewWeek: Array<{ day: string; date: string; shifts: Array<{ name: string; time: string; role: Role }> }> = [
  { day: "Pon", date: "20", shifts: [{ name: "Marta", time: "10–18", role: "manager" }, { name: "Kamil", time: "11–19", role: "cook" }, { name: "Sara", time: "12–20", role: "waiter" }] },
  { day: "Wt", date: "21", shifts: [{ name: "Olga", time: "10–18", role: "cook" }, { name: "Igor", time: "12–20", role: "waiter" }] },
  { day: "Śr", date: "22", shifts: [{ name: "Paweł", time: "10–18", role: "manager" }, { name: "Kamil", time: "11–19", role: "cook" }, { name: "Lena", time: "16–24", role: "bar" }] },
  { day: "Czw", date: "23", shifts: [{ name: "Olga", time: "10–18", role: "cook" }, { name: "Sara", time: "12–20", role: "waiter" }, { name: "Lena", time: "16–24", role: "bar" }] },
  { day: "Pt", date: "24", shifts: [{ name: "Marta", time: "10–18", role: "manager" }, { name: "Kamil", time: "12–22", role: "cook" }, { name: "Igor", time: "14–23", role: "waiter" }, { name: "Lena", time: "18–02", role: "bar" }] },
  { day: "Sob", date: "25", shifts: [{ name: "Paweł", time: "12–20", role: "manager" }, { name: "Olga", time: "12–22", role: "cook" }, { name: "Sara", time: "14–23", role: "waiter" }, { name: "Ola", time: "18–02", role: "bar" }] },
  { day: "Nd", date: "26", shifts: [{ name: "Kamil", time: "12–20", role: "cook" }, { name: "Igor", time: "12–20", role: "waiter" }] },
];

const features: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: CalendarCheck2, title: "Grafik układa się sam", body: "Na podstawie dostępności, ról i priorytetów. Ty tylko poprawiasz i publikujesz." },
  { icon: Scale, title: "Zgodny z Kodeksem pracy", body: "Pilnuje 11 h odpoczynku dobowego i 35 h tygodniowego, zanim ktoś to zauważy." },
  { icon: Repeat2, title: "Zamiany bez czatu", body: "Pracownicy proszą o zamianę lub wolne w aplikacji, a Ty akceptujesz jednym kliknięciem." },
  { icon: Clock3, title: "Ewidencja godzin", body: "Zespół wpisuje godziny, manager zatwierdza. Nocne zmiany liczą się poprawnie." },
  { icon: PieChart, title: "Koszt pracy na bieżąco", body: "Wpisz utarg dnia i od razu widzisz, jaki procent zjadają wypłaty." },
  { icon: FileSpreadsheet, title: "Eksport i kalendarz", body: "Plik CSV dla księgowej, a grafik w kalendarzu Google lub iPhone każdego pracownika." },
];

const steps = [
  { title: "Załóż konto", body: "Nazwa lokalu i email. Bez karty płatniczej." },
  { title: "Zaproś zespół", body: "Pracownicy dołączają z linku i podają dostępność." },
  { title: "Opublikuj grafik", body: "Wygeneruj tydzień, popraw i wyślij zespołowi." },
];

const faqItems = [
  {
    q: "Ile kosztuje Gastrostuff?",
    a: "Do 5 osób korzystasz za darmo, bez limitu czasu. Powyżej tego plan Pro kosztuje 9 zł za osobę miesięcznie (rocznie 2 miesiące taniej), a lokali możesz mieć ile chcesz. Każde nowe konto dostaje 30 dni Pro za darmo."
  },
  {
    q: "Czy potrzebuję karty płatniczej, żeby zacząć?",
    a: "Nie. Zakładasz konto i od razu korzystasz z pełnej wersji Pro przez 30 dni. Potem sam decydujesz, czy przejść na płatny plan, czy zostać na Free.",
  },
  {
    q: "Czy pracownicy muszą instalować aplikację?",
    a: "Nie. Gastrostuff działa w przeglądarce telefonu. Pracownik dostaje link z zaproszeniem, loguje się kodem z maila i widzi swój grafik.",
  },
  {
    q: "Czy grafik uwzględnia przepisy o czasie pracy?",
    a: "Tak. Automatyczny grafik nie przydzieli zmiany, która łamie 11 godzin odpoczynku dobowego lub 35 godzin tygodniowego. Przy ręcznej zmianie dostaniesz ostrzeżenie.",
  },
  {
    q: "Czy obsłużę kilka lokali?",
    a: "Tak, i nie płacisz za lokale. Każdy lokal ma własne szablony zmian, stawki i zespół, a właściciel widzi wszystko w jednym miejscu.",
  },
];

function SectionContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

function SignupLink({ context, className, children }: { context: string; className?: string; children: ReactNode }) {
  return (
    <Link
      to={SIGNUP_URL}
      onClick={() => trackMarketingEvent("signup_cta_click", { context, page: window.location.pathname })}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <motion.div {...reveal} className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-[var(--color-primary)]">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-[var(--color-heading)] sm:text-4xl">{title}</h2>
      {body ? <p className="mt-4 text-base leading-7 text-[var(--color-text-muted)]">{body}</p> : null}
    </motion.div>
  );
}

function WeekPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold text-[var(--color-heading)]">Grafik · 20–26 maja</p>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Opublikowany</span>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-7 sm:p-4">
        {previewWeek.map((day, index) => (
          <div key={day.day} className={cn("min-w-0", index >= 3 && "hidden sm:block")}>
            <p className="px-1 text-xs font-medium text-[var(--color-text-muted)]">
              {day.day} <span className="font-semibold text-[var(--color-heading)]">{day.date}</span>
            </p>
            <div className="mt-2 space-y-1.5">
              {day.shifts.map((shift) => (
                <div key={`${day.day}-${shift.name}`} className={cn("rounded-lg border px-2 py-1.5", roleStyles[shift.role].chip)}>
                  <p className="truncate text-xs font-semibold">{shift.name}</p>
                  <p className="text-[11px] opacity-80">{shift.time}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-xs sm:px-5">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.values(roleStyles).map((role) => (
            <span key={role.label} className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <span className={cn("size-2 rounded-full", role.dot)} />
              {role.label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-medium text-[var(--color-heading)]">
          <span>Koszt pracy 28,6%</span>
          <span>186 h</span>
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <Check className="size-3.5" /> Kodeks pracy OK
          </span>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div lang="pl" className="min-h-dvh overflow-x-clip bg-white text-[var(--color-text)]">
        <header className="sticky top-0 z-30 border-b border-[var(--color-border)]/70 bg-white/85 backdrop-blur">
          <SectionContainer className="flex h-16 items-center justify-between gap-4">
            <Link to="/" className="shrink-0" aria-label="Gastrostuff">
              <BrandLogo kind="wordmark" className="text-[2rem]" />
            </Link>
            <nav aria-label="Sekcje strony" className="hidden md:block">
              <ul className="flex items-center gap-8">
                {navItems.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="text-sm font-medium text-[var(--color-text-muted)] transition hover:text-[var(--color-heading)]">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="flex items-center gap-4">
              <DevLoginButton className="hidden sm:inline-flex" />
              <Link to={SIGNIN_URL} className="text-sm font-medium text-[var(--color-heading)] transition hover:text-[var(--color-primary)]">
                Zaloguj
              </Link>
              <SignupLink context="header" className="min-h-9 px-4">
                Zacznij za darmo
              </SignupLink>
            </div>
          </SectionContainer>
        </header>

        <main>
          <section className="pt-16 sm:pt-24">
            <SectionContainer>
              <motion.div {...reveal} className="mx-auto max-w-3xl text-center">
                <h1 className="text-4xl font-bold tracking-tight text-[var(--color-heading)] sm:text-6xl">
                  Grafik dla restauracji <span className="whitespace-nowrap text-[var(--color-primary)]">w 10 minut</span>
                </h1>
                <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[var(--color-text-muted)]">
                  Dostępność zespołu, Kodeks pracy i koszt pracy liczą się same. Ty tylko publikujesz.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <SignupLink context="hero" className="w-full px-6 sm:w-auto">
                    Zacznij za darmo <ArrowRight className="size-4" />
                  </SignupLink>
                  <a
                    href="#funkcje"
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--color-border)] px-6 text-sm font-semibold text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)] sm:w-auto"
                  >
                    Zobacz, jak działa
                  </a>
                </div>
                <p className="mt-5 text-sm text-[var(--color-text-muted)]">30 dni Pro gratis · bez karty · 9 zł za osobę, lokale bez limitu</p>
              </motion.div>

              <motion.div {...reveal} className="mx-auto mt-14 max-w-5xl sm:mt-16">
                <WeekPreview />
              </motion.div>
            </SectionContainer>
          </section>

          <section id="funkcje" className="scroll-mt-16 py-20 sm:py-28">
            <SectionContainer>
              <SectionHeading eyebrow="Funkcje" title="Wszystko, czego potrzebuje zmiana. Nic więcej." />
              <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-3">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <motion.div key={feature.title} {...reveal} className="bg-white p-6 sm:p-7">
                      <Icon className="size-5 text-[var(--color-primary)]" aria-hidden="true" />
                      <h3 className="mt-4 text-base font-semibold text-[var(--color-heading)]">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{feature.body}</p>
                    </motion.div>
                  );
                })}
              </div>
            </SectionContainer>
          </section>

          <section className="border-y border-[var(--color-border)] bg-[var(--color-surface-muted)] py-20 sm:py-24">
            <SectionContainer>
              <SectionHeading eyebrow="Jak zacząć" title="Pierwszy grafik jeszcze dziś" />
              <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
                {steps.map((step, index) => (
                  <motion.li key={step.title} {...reveal} className="text-center sm:text-left">
                    <span className="text-sm font-semibold text-[var(--color-primary)]">0{index + 1}</span>
                    <h3 className="mt-2 text-lg font-semibold text-[var(--color-heading)]">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{step.body}</p>
                  </motion.li>
                ))}
              </ol>
            </SectionContainer>
          </section>

          <section id="cennik" className="scroll-mt-16 py-20 sm:py-28">
            <SectionContainer>
              <SectionHeading
                eyebrow="Cennik"
                title="9 zł za osobę. Nic więcej."
                body="Do 5 osób za darmo na zawsze. Lokale bez limitu w każdym planie. Każde nowe konto zaczyna od 30 dni Pro."
              />
              <div className="mx-auto mt-12 grid max-w-3xl gap-4 md:grid-cols-2">
                {plans.map((plan) => {
                  const featured = plan.key === "pro";
                  return (
                    <motion.div
                      key={plan.key}
                      {...reveal}
                      className={cn(
                        "flex flex-col rounded-2xl border p-6",
                        featured ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]" : "border-[var(--color-border)]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-semibold text-[var(--color-heading)]">{plan.title}</h3>
                        {featured ? <span className="rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-primary)]">Najczęściej wybierany</span> : null}
                      </div>
                      <p className="mt-4">
                        <span className="text-4xl font-bold tracking-tight text-[var(--color-heading)]">{plan.price}</span>{" "}
                        <span className="text-sm text-[var(--color-text-muted)]">{plan.cycle}</span>
                      </p>
                      <ul className="mt-6 flex-1 space-y-2.5">
                        {plan.highlights.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-heading)]">
                            <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <SignupLink
                        context={`pricing-${plan.key}`}
                        className={cn(
                          "mt-8 w-full",
                          !featured && "border border-[var(--color-border)] bg-white text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] hover:opacity-100",
                        )}
                      >
                        {featured ? "Wypróbuj 30 dni gratis" : "Zacznij za darmo"}
                      </SignupLink>
                    </motion.div>
                  );
                })}
              </div>
              <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">Przykład: zespół 15 osób to {formatPln(15 * PRO_SEAT_PRICE_PLN.monthly)} miesięcznie.</p>
            </SectionContainer>
          </section>

          <section id="faq" className="scroll-mt-16 pb-20 sm:pb-28">
            <SectionContainer>
              <SectionHeading eyebrow="FAQ" title="Najczęstsze pytania" />
              <div className="mx-auto mt-10 max-w-3xl divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
                {faqItems.map((item) => (
                  <details key={item.q} className="group py-1">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-base font-medium text-[var(--color-heading)] [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <ChevronDown className="size-4 shrink-0 text-[var(--color-text-muted)] transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <p className="pb-5 pr-8 text-sm leading-7 text-[var(--color-text-muted)]">{item.a}</p>
                  </details>
                ))}
              </div>
            </SectionContainer>
          </section>

          <section className="pb-20 sm:pb-28">
            <SectionContainer>
              <motion.div {...reveal} className="rounded-3xl bg-[var(--color-heading)] px-6 py-14 text-center sm:px-12">
                <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Pierwszy grafik ułożysz jeszcze dziś</h2>
                <p className="mx-auto mt-3 max-w-md text-base text-white/70">30 dni planu Pro za darmo. Bez karty, bez umowy.</p>
                <SignupLink context="final-cta" className="mt-8 bg-white px-6 text-[var(--color-heading)]">
                  Zacznij za darmo <ArrowRight className="size-4" />
                </SignupLink>
              </motion.div>
            </SectionContainer>
          </section>
        </main>

        <footer className="border-t border-[var(--color-border)] py-8">
          <SectionContainer className="flex flex-col gap-6 text-sm text-[var(--color-text-muted)] md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <BrandLogo kind="wordmark" className="text-[1.6rem]" />
              <a href="mailto:support@gastrostuff.pl" className="transition hover:text-[var(--color-heading)]">
                support@gastrostuff.pl
              </a>
              <div className="flex items-center gap-3">
                <a href="https://www.instagram.com/gastrostuff.pl/" target="_blank" rel="noreferrer" aria-label="Instagram" className="transition hover:text-[var(--color-heading)]">
                  <Instagram className="size-4" />
                </a>
                <a href="https://www.facebook.com/profile.php?id=61590746600186" target="_blank" rel="noreferrer" aria-label="Facebook" className="transition hover:text-[var(--color-heading)]">
                  <Facebook className="size-4" />
                </a>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link to="/regulamin" className="transition hover:text-[var(--color-heading)]">
                Regulamin
              </Link>
              <Link to="/polityka-prywatnosci" className="transition hover:text-[var(--color-heading)]">
                Prywatność
              </Link>
              <Link to="/polityka-cookies" className="transition hover:text-[var(--color-heading)]">
                Cookies
              </Link>
              <span>© 2026 Gastrostuff</span>
            </div>
          </SectionContainer>
        </footer>
      </div>
    </MotionConfig>
  );
}
