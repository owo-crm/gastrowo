import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  LayoutGrid,
  ListTodo,
  MessageSquareMore,
  NotebookText,
  PlayCircle,
  ShieldCheck,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const pageReveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.22 },
  transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const },
};

const navItems = [
  { href: "#produkt", label: "Produkt" },
  { href: "#jak-to-dziala", label: "Jak to działa" },
  { href: "#dla-kogo", label: "Dla kogo" },
  { href: "#cennik", label: "Cennik" },
  { href: "#faq", label: "FAQ" },
];

const quickPoints: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Clock3, title: "Szybki start", body: "Gotowe w kilka minut" },
  { icon: Users2, title: "Dla całego zespołu", body: "Właściciel, manager, pracownik" },
  { icon: ShieldCheck, title: "Bez zbędnych rzeczy", body: "Tylko to, czego potrzebujesz" },
];

const stripItems: Array<{ icon: LucideIcon; title: string; body: string; tone: string }> = [
  {
    icon: CalendarDays,
    title: "Lepsze grafiki",
    body: "Twórz sprawiedliwe grafiki w minutę. Uwzględnij dostępność, role i budżet.",
    tone: "bg-[rgba(37,99,235,0.10)] text-[#2563eb]",
  },
  {
    icon: Users2,
    title: "Zgrany zespół",
    body: "Komunikacja, prośby o zmiany i dostępność w jednym miejscu.",
    tone: "bg-[rgba(34,197,94,0.12)] text-[#16a34a]",
  },
  {
    icon: BarChart3,
    title: "Pełna kontrola",
    body: "Przychody, koszty pracy i zadania pod ręką - każdego dnia.",
    tone: "bg-[rgba(37,99,235,0.10)] text-[#2563eb]",
  },
];

const heroMetrics = [
  { label: "Przychód dzisiaj", value: "12 450 PLN", note: "vs wczoraj  +10%" },
  { label: "Koszt pracy", value: "28,6%", note: "3 560 PLN" },
  { label: "Śr. przychód na h", value: "156 PLN", note: "80,0 h" },
  { label: "Prośby o zmiany", value: "5", note: "Do akceptacji" },
];

const sectionPlannerBullets = [
  "Widok tygodnia dla całego zespołu",
  "Koszt pracy i liczba godzin na żywo",
  "Publikuj jednym kliknięciem",
];

const sectionRequestsBullets = [
  "Prośby o zmiany, godziny i wolne",
  "Statusy: do akceptacji, zaakceptowane, odrzucone",
  "Widok dostępności zespołu",
];

const sectionRevenueBullets = [
  "Szybki wpis przychodu z telefonu lub komputera",
  "Procent kosztów pracy w czasie rzeczywistym",
  "Historia i porównania dzień po dniu",
];

const sectionWorkspaceBullets = [
  "Listy zadań z przypisaniem",
  "Notatki i pliki dla całego zespołu",
  "Kontakty pracowników i role",
];

const workflowSteps: Array<{ icon: LucideIcon; title: string; body: string; tone: string }> = [
  {
    icon: LayoutGrid,
    title: "Utwórz workspace",
    body: "Załóż restaurację, dodaj lokal, ustaw role i godziny otwarcia.",
    tone: "bg-[rgba(37,99,235,0.10)] text-[#2563eb]",
  },
  {
    icon: Users2,
    title: "Zaproś zespół",
    body: "Wyślij zaproszenia e-mail. Każdy dołącza jednym kliknięciem.",
    tone: "bg-[rgba(34,197,94,0.12)] text-[#16a34a]",
  },
  {
    icon: PlayCircle,
    title: "Działaj co tydzień",
    body: "Planuj grafik, akceptuj prośby, śledź wynik i rozwijaj restaurację.",
    tone: "bg-[rgba(37,99,235,0.10)] text-[#2563eb]",
  },
];

const audienceCards = [
  {
    badge: "WŁAŚCICIEL",
    title: "Masz pełną kontrolę nad restauracją",
    bullets: [
      "Widok finansów i kosztów pracy w czasie rzeczywistym",
      "Pełna kontrola nad grafikiem i personelem",
      "Ustawienia biznesu, role i uprawnienia",
      "Raporty, historia i planowanie z wyprzedzeniem",
    ],
    portrait: "owner" as const,
    accent: "text-[#2563eb] border-[rgba(37,99,235,0.18)] bg-[rgba(37,99,235,0.04)]",
  },
  {
    badge: "MANAGER",
    title: "Planowanie i zespół pod kontrolą",
    bullets: [
      "Twórz grafiki zgodne z dostępnością i budżetem",
      "Akceptuj prośby i komunikuj się z zespołem",
      "Zadania operacyjne i checklisty na co dzień",
      "Wszystkie kluczowe informacje w jednym miejscu",
    ],
    portrait: "manager" as const,
    accent: "text-[#16a34a] border-[rgba(34,197,94,0.20)] bg-[rgba(34,197,94,0.05)]",
  },
];

const faqItems = [
  "Czy mogę wypróbować GastrOWO za darmo?",
  "Czy pracownicy potrzebują własnego konta?",
  "Czy mogę używać GastrOWO w więcej niż jednym lokalu?",
  "Jak działa planowanie grafiku?",
  "Czy moje dane są bezpieczne?",
  "Czy mogę anulować subskrypcję w dowolnym momencie?",
];

const requestRows = [
  { name: "Julia W.", slot: "Sobota, 25 maja  10:00 - 16:00", request: "Prośba o zamianę", reason: "Wizyta u lekarza" },
  { name: "Tomek K.", slot: "Piątek, 24 maja  12:00 - 18:00", request: "Prośba o zmianę godziny", reason: "Sprawy osobiste" },
  { name: "Michał D.", slot: "Niedziela, 26 maja  12:00 - 20:00", request: "Prośba o wolne", reason: "Wyjazd" },
];

const taskRows = [
  ["Kontrola dostaw", "Dzisiaj", "Anna N."],
  ["Sprzątanie zaplecza", "Dzisiaj", "Michał D."],
  ["Uzupełnienie lodówki", "Jutro", "Kasia P."],
  ["Przegląd ekspresu", "25.05", "Tomek K."],
];

const scheduleHours = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];
const scheduleDays = [
  { key: "PON", date: "20" },
  { key: "WT", date: "21" },
  { key: "ŚR", date: "22" },
  { key: "CZW", date: "23" },
  { key: "PT", date: "24" },
  { key: "SOB", date: "25" },
  { key: "ND", date: "26" },
];

const scheduleAssignments = [
  { day: 0, lane: 0, start: 0, end: 8, label: "Marta", tone: "border-[#7ad7ab] bg-[rgba(34,197,94,0.16)] text-[#166534]" },
  { day: 1, lane: 0, start: 2, end: 9, label: "Sara B.", tone: "border-[#9bbffc] bg-[rgba(96,165,250,0.16)] text-[#1d4ed8]" },
  { day: 1, lane: 1, start: 6, end: 10, label: "Ola", tone: "border-[#fdc86b] bg-[rgba(251,191,36,0.16)] text-[#b45309]" },
  { day: 2, lane: 0, start: 2, end: 9, label: "Lena K.", tone: "border-[#9bbffc] bg-[rgba(96,165,250,0.16)] text-[#1d4ed8]" },
  { day: 2, lane: 1, start: 5, end: 9, label: "Dawid", tone: "border-[#fdc86b] bg-[rgba(251,191,36,0.16)] text-[#b45309]" },
  { day: 3, lane: 0, start: 2, end: 9, label: "Igor P.", tone: "border-[#9bbffc] bg-[rgba(96,165,250,0.16)] text-[#1d4ed8]" },
  { day: 3, lane: 1, start: 5, end: 9, label: "Michał", tone: "border-[#fdc86b] bg-[rgba(251,191,36,0.16)] text-[#b45309]" },
  { day: 4, lane: 0, start: 2, end: 9, label: "Sara W.", tone: "border-[#9bbffc] bg-[rgba(96,165,250,0.16)] text-[#1d4ed8]" },
  { day: 4, lane: 1, start: 6, end: 9, label: "Ola", tone: "border-[#fdc86b] bg-[rgba(251,191,36,0.16)] text-[#b45309]" },
  { day: 5, lane: 0, start: 2, end: 8, label: "Lena R.", tone: "border-[#9bbffc] bg-[rgba(96,165,250,0.16)] text-[#1d4ed8]" },
  { day: 5, lane: 1, start: 6, end: 10, label: "Kasia", tone: "border-[#c8b5ff] bg-[rgba(167,139,250,0.18)] text-[#7c3aed]" },
  { day: 6, lane: 0, start: 2, end: 8, label: "Ania", tone: "border-[#9bbffc] bg-[rgba(96,165,250,0.16)] text-[#1d4ed8]" },
  { day: 6, lane: 1, start: 6, end: 9, label: "Karolina", tone: "border-[#c8b5ff] bg-[rgba(167,139,250,0.18)] text-[#7c3aed]" },
];

const heroLegend = [
  { label: "Cook", tone: "bg-[#f59e0b]" },
  { label: "Waiter", tone: "bg-[#60a5fa]" },
  { label: "Bartender", tone: "bg-[#a78bfa]" },
  { label: "Manager", tone: "bg-[#4ade80]" },
];

function LandingWordmark({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <BrandLogo
      kind="wordmark"
      tone="light"
      className={cn("w-auto object-contain", size === "lg" ? "h-14 sm:h-16" : "h-8 sm:h-9")}
    />
  );
}

function HeroScheduleBoardAdaptive() {
  const rowHeight = 24;
  const hours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  const desktopDays = scheduleDays;
  const mobileDays = scheduleDays.slice(0, 4);
  const desktopAssignments = scheduleAssignments.map((item) => ({
    ...item,
    label: item.label.replace(/\s+[A-Z]\.$/, ""),
  }));
  const mobileAssignments = desktopAssignments.filter((item) => item.day < 4).map((item) => ({
    ...item,
    label: item.label.split(" ")[0],
  }));
  const metrics = [
    { label: "Przychód dzisiaj", value: "12 450 PLN", note: "vs wczoraj +10%" },
    { label: "Koszt pracy", value: "28,6%", note: "3 560 PLN" },
    { label: "Śr. przychód na h", value: "156 PLN", note: "80,0 h" },
    { label: "Prośby o zmiany", value: "5", note: "Do akceptacji" },
  ];

  return (
    <div className="overflow-hidden rounded-[1.45rem] border border-[rgba(221,230,243,0.96)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[rgba(233,238,246,0.92)] px-4 py-3 sm:px-5">
        {heroLegend.map((item) => (
          <div key={item.label} className="flex items-center gap-2.5">
            <span className={cn("size-3.5 rounded-full", item.tone)} />
            <span className="text-[11px] font-semibold text-[var(--color-heading)]">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="hidden md:grid md:grid-cols-[128px_minmax(0,1fr)] lg:grid-cols-[140px_minmax(0,1fr)]">
        <div className="border-r border-[rgba(233,238,246,0.92)] bg-[linear-gradient(180deg,#ffffff,#fbfdff)] px-3 py-4 lg:px-4">
          <LandingWordmark size="sm" />
          <div className="mt-4 space-y-1.5">
            {["Przegląd", "Grafik", "Zadania", "Zespół", "Raporty", "Notatki", "Ustawienia"].map((item) => (
              <button
                key={item}
                type="button"
                className={cn(
                  "w-full text-left rounded-[0.8rem] px-3 py-2 text-[11px] font-semibold transition-all duration-200",
                  item === "Grafik"
                    ? "bg-[rgba(37,99,235,0.08)] text-[#2563eb]"
                    : "text-[var(--color-text-muted)] hover:bg-[rgba(37,99,235,0.04)] hover:text-[#2563eb]",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-[1rem] border border-[rgba(229,235,245,0.92)] bg-white px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Biuro Wrocław</p>
            <div className="mt-3 flex items-center gap-3">
              <MiniAvatar initials="JK" />
              <div className="min-w-0">
                <p className="text-[12px] font-bold leading-4 text-[var(--color-heading)]">Jan Kowalski</p>
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Właściciel</p>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 bg-[linear-gradient(180deg,#ffffff,#fbfdff)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-5">
            <div>
              <p className="text-[1.05rem] font-extrabold tracking-[-0.05em] text-[var(--color-heading)] lg:text-[1.15rem]">Grafik tygodniowy</p>
              <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">20 - 26 maja 2034</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-full border border-[rgba(223,231,243,0.9)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:bg-[rgba(37,99,235,0.05)] hover:text-[#2563eb] transition-all duration-200">Dzisiaj</button>
              <button type="button" className="grid size-7 place-items-center rounded-full border border-[rgba(223,231,243,0.9)] text-[var(--color-text-muted)] hover:bg-[rgba(37,99,235,0.05)] hover:text-[#2563eb] transition-all duration-200">&lt;</button>
              <button type="button" className="grid size-7 place-items-center rounded-full border border-[rgba(223,231,243,0.9)] text-[var(--color-text-muted)] hover:bg-[rgba(37,99,235,0.05)] hover:text-[#2563eb] transition-all duration-200">&gt;</button>
              <button type="button" className="rounded-[0.8rem] bg-[#22c55e] hover:bg-[#1eb052] hover:scale-[1.02] active:scale-[0.98] px-3 py-1.5 text-[11px] font-bold text-white transition-all duration-200">Publikuj grafik</button>
            </div>
          </div>

          <div className="border-t border-[rgba(233,238,246,0.92)]">
            <div className="grid grid-cols-[46px_repeat(7,minmax(0,1fr))] border-b border-[rgba(233,238,246,0.92)] bg-[rgba(248,251,255,0.85)] lg:grid-cols-[52px_repeat(7,minmax(0,1fr))]">
              <div className="border-r border-[rgba(233,238,246,0.92)]" />
              {desktopDays.map((day) => (
                <div key={day.key} className="border-r border-[rgba(233,238,246,0.92)] px-1 py-2 text-center lg:px-2 lg:py-2.5">
                  <p className="text-[8px] font-black tracking-[0.14em] text-[var(--color-text-muted)] lg:text-[9px]">{day.key}</p>
                  <p className="mt-0.5 text-[10px] font-bold text-[var(--color-heading)] lg:text-xs">{day.date}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[46px_repeat(7,minmax(0,1fr))] lg:grid-cols-[52px_repeat(7,minmax(0,1fr))]">
              <div className="border-r border-[rgba(233,238,246,0.92)] bg-[rgba(248,251,255,0.72)]">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-[rgba(233,238,246,0.92)] pr-1 pt-1 text-right text-[8px] font-semibold text-[var(--color-text-muted)] lg:pr-2 lg:text-[10px]"
                    style={{ height: `${rowHeight}px` }}
                  >
                    {hour}
                  </div>
                ))}
              </div>

              {desktopDays.map((day, dayIndex) => {
                const entries = desktopAssignments.filter((item) => item.day === dayIndex);
                return (
                  <div key={day.key} className="relative border-r border-[rgba(233,238,246,0.92)]">
                    {hours.map((hour) => (
                      <div key={`${day.key}-${hour}`} className="border-b border-[rgba(233,238,246,0.92)]" style={{ height: `${rowHeight}px` }} />
                    ))}
                    {entries.map((entry) => {
                      const top = entry.start * rowHeight + 2;
                      const height = Math.max((entry.end - entry.start) * rowHeight - 4, 18);
                      return (
                        <motion.div
                          key={`${day.key}-${entry.label}-${entry.lane}`}
                          initial={{ opacity: 0, scale: 0.92, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 90,
                            damping: 14,
                            delay: entry.day * 0.05 + entry.lane * 0.03,
                          }}
                          whileHover={{
                            scale: 1.04,
                            filter: "brightness(0.98)",
                            boxShadow: "0 10px 22px rgba(15,23,42,0.08)",
                          }}
                          className={cn(
                            "absolute overflow-hidden rounded-[0.72rem] border px-1 py-1 text-[7px] font-semibold leading-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] lg:px-1.5 lg:text-[8px] cursor-pointer transition-colors duration-200",
                            entry.tone,
                          )}
                          style={{
                            top: `${top}px`,
                            left: entry.lane === 0 ? "2px" : "calc(50% + 1px)",
                            width: entry.lane === 0 ? "calc(50% - 3px)" : "calc(50% - 4px)",
                            height: `${height}px`,
                          }}
                        >
                          <p className="truncate">{entry.label}</p>
                        </motion.div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2 border-t border-[rgba(233,238,246,0.92)] bg-[rgba(248,251,255,0.8)] p-3 lg:gap-3 lg:p-4 xl:grid-cols-4">
            {metrics.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.08 + 0.3 }}
                whileHover={{
                  y: -4,
                  boxShadow: "0 12px 24px rgba(15,23,42,0.06)",
                  borderColor: "rgba(37,99,235,0.18)",
                }}
                className="rounded-[1rem] border border-[rgba(223,231,243,0.9)] bg-white px-3 py-3 lg:px-4 lg:py-4 transition-colors duration-200 cursor-pointer"
              >
                <p className="min-h-[1.9rem] text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)] lg:min-h-[2.5rem] lg:text-[10px] lg:tracking-[0.16em]">{item.label}</p>
                <p className="mt-2 whitespace-nowrap text-[0.9rem] font-extrabold tracking-[-0.04em] text-[var(--color-heading)] lg:mt-3 lg:text-[1.35rem]">{item.value}</p>
                <p className="mt-1 text-[10px] font-medium text-[var(--color-text-muted)] lg:mt-2 lg:text-[11px]">{item.note}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <div className="bg-[linear-gradient(180deg,#ffffff,#fbfdff)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <LandingWordmark size="sm" />
              <p className="mt-3 text-sm font-extrabold tracking-[-0.04em] text-[var(--color-heading)]">Grafik tygodniowy</p>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">20 - 26 maja 2034</p>
            </div>
            <div className="rounded-[0.9rem] border border-[rgba(229,235,245,0.92)] bg-white px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Biuro Wrocław</p>
              <p className="mt-1 text-[11px] font-bold text-[var(--color-heading)]">Jan Kowalski</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="rounded-full border border-[rgba(223,231,243,0.9)] px-3 py-1.5 text-[10px] font-semibold text-[var(--color-text-muted)] hover:bg-[rgba(37,99,235,0.05)] hover:text-[#2563eb] transition-all duration-200">Dzisiaj</button>
            <button type="button" className="rounded-[0.75rem] bg-[#22c55e] hover:bg-[#1eb052] active:scale-[0.98] px-3 py-1.5 text-[10px] font-bold text-white transition-all duration-200">Publikuj grafik</button>
          </div>
        </div>

        <div className="border-t border-[rgba(233,238,246,0.92)]">
          <div className="grid grid-cols-[40px_repeat(4,minmax(0,1fr))] border-b border-[rgba(233,238,246,0.92)] bg-[rgba(248,251,255,0.85)]">
            <div className="border-r border-[rgba(233,238,246,0.92)]" />
            {mobileDays.map((day) => (
              <div key={day.key} className="border-r border-[rgba(233,238,246,0.92)] px-1 py-2 text-center">
                <p className="text-[8px] font-black tracking-[0.14em] text-[var(--color-text-muted)]">{day.key}</p>
                <p className="mt-0.5 text-[10px] font-bold text-[var(--color-heading)]">{day.date}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[40px_repeat(4,minmax(0,1fr))]">
            <div className="border-r border-[rgba(233,238,246,0.92)] bg-[rgba(248,251,255,0.72)]">
              {hours.slice(1).map((hour) => (
                <div key={hour} className="border-b border-[rgba(233,238,246,0.92)] pr-1 pt-1 text-right text-[8px] font-semibold text-[var(--color-text-muted)]" style={{ height: "20px" }}>
                  {hour}
                </div>
              ))}
            </div>
            {mobileDays.map((day, dayIndex) => {
              const entries = mobileAssignments.filter((item) => item.day === dayIndex);
              return (
                <div key={`${day.key}-mobile`} className="relative border-r border-[rgba(233,238,246,0.92)]">
                  {hours.slice(1).map((hour) => (
                    <div key={`${day.key}-${hour}`} className="border-b border-[rgba(233,238,246,0.92)]" style={{ height: "20px" }} />
                  ))}
                  {entries.slice(0, 2).map((entry) => {
                    const top = Math.max((entry.start - 1) * 20 + 2, 2);
                    const height = Math.max((entry.end - entry.start) * 20 - 4, 18);
                    return (
                      <motion.div
                        key={`${day.key}-${entry.label}-${entry.lane}-mobile`}
                        initial={{ opacity: 0, scale: 0.9, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 100,
                          damping: 15,
                          delay: entry.day * 0.05 + entry.lane * 0.03,
                        }}
                        whileHover={{
                          scale: 1.04,
                          boxShadow: "0 8px 16px rgba(0,0,0,0.08)",
                        }}
                        className={cn("absolute overflow-hidden rounded-[0.62rem] border px-1 py-1 text-[6px] font-semibold leading-3 shadow-[0_6px_14px_rgba(15,23,42,0.04)] cursor-pointer transition-colors duration-200", entry.tone)}
                        style={{
                          top: `${top}px`,
                          left: entry.lane === 0 ? "2px" : "calc(50% + 1px)",
                          width: entry.lane === 0 ? "calc(50% - 3px)" : "calc(50% - 4px)",
                          height: `${height}px`,
                        }}
                      >
                        <p className="truncate">{entry.label}</p>
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-[rgba(233,238,246,0.92)] bg-[rgba(248,251,255,0.8)] p-3">
          {metrics.map((item, index) => (
            <motion.div
              key={`${item.label}-mobile`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 + 0.3 }}
              whileHover={{
                y: -2,
                boxShadow: "0 8px 16px rgba(15,23,42,0.05)",
                borderColor: "rgba(37,99,235,0.15)",
              }}
              className="rounded-[1rem] border border-[rgba(223,231,243,0.9)] bg-white px-3 py-3 transition-colors duration-200 cursor-pointer"
            >
              <p className="min-h-[2rem] text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{item.label}</p>
              <p className="mt-2 text-[0.85rem] font-extrabold tracking-[-0.04em] text-[var(--color-heading)]">{item.value}</p>
              <p className="mt-1 text-[9px] text-[var(--color-text-muted)]">{item.note}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
function SectionContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[0.82rem] font-extrabold uppercase tracking-[0.16em] text-[#2563eb]">{children}</p>;
}

function CheckList({ items }: { items: string[] }) {
  return (
    <div className="mt-5 space-y-3">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-3 text-[15px] leading-6 text-[var(--color-heading)]">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[rgba(34,197,94,0.14)] text-[#16a34a]">
            <Check className="size-3.5" />
          </span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[1.1rem] border border-[rgba(223,231,243,0.9)] bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-[1.55rem] font-extrabold tracking-[-0.05em] text-[var(--color-heading)]">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">{note}</p>
    </div>
  );
}

function ScheduleBoard({ compact = false, className }: { compact?: boolean; className?: string }) {
  const rowHeight = compact ? 28 : 40;
  const laneCount = 2;
  const laneGap = compact ? 6 : 8;
  const sidePadding = compact ? 8 : 10;
  const laneWidth = `calc((100% - ${sidePadding * 2}px - ${laneGap * (laneCount - 1)}px) / ${laneCount})`;

  return (
    <div className={cn("overflow-hidden rounded-[1.2rem] border border-[rgba(229,235,245,0.96)] bg-white", className)}>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] border-b border-[rgba(233,238,246,0.92)] bg-[linear-gradient(180deg,#ffffff,#f8fbff)]">
        <div className="border-r border-[rgba(233,238,246,0.92)]" />
        <div className="grid min-w-0 grid-cols-7">
          {scheduleDays.map((day) => (
            <div
              key={day.key}
              className={cn(
                "border-r border-[rgba(233,238,246,0.92)] px-3",
                compact ? "py-2.5" : "py-4",
              )}
            >
              <p className={cn("font-black tracking-[0.14em] text-[var(--color-text-muted)]", compact ? "text-[9px]" : "text-[11px]")}>{day.key}</p>
              <p className={cn("mt-1 font-extrabold tracking-[-0.05em] text-[var(--color-heading)]", compact ? "text-lg" : "text-[2rem]")}>{day.date}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[72px_minmax(0,1fr)]">
        <div className="border-r border-[rgba(233,238,246,0.92)] bg-[rgba(249,251,255,0.7)]">
          {scheduleHours.map((hour) => (
            <div
              key={hour}
              className="flex items-start justify-end border-b border-[rgba(233,238,246,0.92)] pr-3 pt-1.5 text-[11px] font-semibold text-[var(--color-text-muted)]"
              style={{ height: `${rowHeight}px` }}
            >
              {hour}
            </div>
          ))}
        </div>

        <div className="relative min-w-0" style={{ height: `${scheduleHours.length * rowHeight}px` }}>
          <div className="absolute inset-0 grid grid-cols-7">
            {scheduleDays.map((day) => (
              <div key={day.key} className="border-r border-[rgba(233,238,246,0.92)]">
                {scheduleHours.map((hour) => (
                  <div key={`${day.key}-${hour}`} className="border-b border-[rgba(233,238,246,0.92)]" style={{ height: `${rowHeight}px` }} />
                ))}
              </div>
            ))}
          </div>

          <div className="absolute inset-0 grid grid-cols-7">
            {scheduleDays.map((day, dayIndex) => {
              const entries = scheduleAssignments.filter((item) => item.day === dayIndex);
              return (
                <div key={`${day.key}-content`} className="relative border-r border-transparent">
                  {entries.map((entry) => {
                    const top = entry.start * rowHeight;
                    const height = (entry.end - entry.start) * rowHeight;
                    return (
                      <motion.div
                        key={`${day.key}-${entry.label}-${entry.lane}`}
                        initial={{ opacity: 0, scale: 0.92, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 90,
                          damping: 14,
                          delay: entry.day * 0.05 + entry.lane * 0.03,
                        }}
                        whileHover={{
                          scale: 1.03,
                          filter: "brightness(0.98)",
                          boxShadow: "0 10px 22px rgba(15,23,42,0.08)",
                        }}
                        className={cn(
                          "absolute overflow-hidden rounded-[0.9rem] border px-2.5 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)] cursor-pointer transition-colors duration-200",
                          entry.tone,
                          compact ? "text-[9px]" : "text-[11px]",
                        )}
                        style={{
                          top: `${top}px`,
                          left: entry.lane === 0 ? `${sidePadding}px` : `calc(${sidePadding}px + ${laneWidth} + ${laneGap}px)`,
                          width: laneWidth,
                          height: `${height}px`,
                        }}
                      >
                        <div className="space-y-1">
                          <p className="font-bold">{entry.label}</p>
                          {!compact && height >= rowHeight * 3 ? <p className="font-semibold opacity-90">{entry.label}</p> : null}
                          {!compact && height >= rowHeight * 5 ? <p className="font-semibold opacity-90">{entry.label}</p> : null}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!compact ? (
        <div className="grid gap-3 border-t border-[rgba(233,238,246,0.92)] bg-[rgba(249,251,255,0.7)] p-4 sm:grid-cols-2 xl:grid-cols-4">
          {heroMetrics.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HeroScheduleBoard() {
  const rowHeight = 24;
  const hours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  const metrics = [
    { label: "Przychód dzisiaj", value: "12 450 PLN", note: "vs wczoraj +10%" },
    { label: "Koszt pracy", value: "28,6%", note: "3 560 PLN" },
    { label: "Śr. przychód na h", value: "156 PLN", note: "80,0 h" },
    { label: "Prośby o zmiany", value: "5", note: "Do akceptacji" },
  ];

  return (
    <div className="overflow-hidden rounded-[1.45rem] border border-[rgba(221,230,243,0.96)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-5 border-b border-[rgba(233,238,246,0.92)] px-5 py-3">
        {heroLegend.map((item) => (
          <div key={item.label} className="flex items-center gap-2.5">
            <span className={cn("size-3.5 rounded-full", item.tone)} />
            <span className="text-[11px] font-semibold text-[var(--color-heading)]">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[152px_minmax(0,1fr)]">
        <div className="border-r border-[rgba(233,238,246,0.92)] bg-[linear-gradient(180deg,#ffffff,#fbfdff)] px-4 py-4">
          <LandingWordmark size="sm" />
          <div className="mt-4 space-y-1.5">
            {["Przegląd", "Grafik", "Zadania", "Zespół", "Raporty", "Notatki", "Ustawienia"].map((item) => (
              <div
                key={item}
                className={cn(
                  "rounded-[0.8rem] px-3 py-2 text-[11px] font-semibold",
                  item === "Grafik" ? "bg-[rgba(37,99,235,0.08)] text-[#2563eb]" : "text-[var(--color-text-muted)]",
                )}
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-[1rem] border border-[rgba(229,235,245,0.92)] bg-white px-3.5 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Biuro Wrocław</p>
            <div className="mt-3 flex items-center gap-3">
              <MiniAvatar initials="JK" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold leading-5 text-[var(--color-heading)]">Jan Kowalski</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">Właściciel</p>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 bg-[linear-gradient(180deg,#ffffff,#fbfdff)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-[1.15rem] font-extrabold tracking-[-0.05em] text-[var(--color-heading)]">Grafik tygodniowy</p>
              <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">20 – 26 maja 2034</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[rgba(223,231,243,0.9)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)]">Dzisiaj</span>
              <span className="grid size-7 place-items-center rounded-full border border-[rgba(223,231,243,0.9)] text-[var(--color-text-muted)]">‹</span>
              <span className="grid size-7 place-items-center rounded-full border border-[rgba(223,231,243,0.9)] text-[var(--color-text-muted)]">›</span>
              <span className="rounded-[0.8rem] bg-[#22c55e] px-3 py-1.5 text-[11px] font-bold text-white">Publikuj grafik</span>
            </div>
          </div>

          <div className="border-t border-[rgba(233,238,246,0.92)]">
            <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-[rgba(233,238,246,0.92)] bg-[rgba(248,251,255,0.85)]">
              <div className="border-r border-[rgba(233,238,246,0.92)]" />
              {scheduleDays.map((day) => (
                <div key={day.key} className="border-r border-[rgba(233,238,246,0.92)] px-2 py-2.5 text-center">
                  <p className="text-[9px] font-black tracking-[0.16em] text-[var(--color-text-muted)]">{day.key}</p>
                  <p className="mt-0.5 text-xs font-bold text-[var(--color-heading)]">{day.date}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
              <div className="border-r border-[rgba(233,238,246,0.92)] bg-[rgba(248,251,255,0.72)]">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-[rgba(233,238,246,0.92)] px-2 pt-1 text-right text-[10px] font-semibold text-[var(--color-text-muted)]"
                    style={{ height: `${rowHeight}px` }}
                  >
                    {hour}
                  </div>
                ))}
              </div>

              {scheduleDays.map((day, dayIndex) => {
                const entries = scheduleAssignments.filter((item) => item.day === dayIndex);
                return (
                  <div key={day.key} className="relative border-r border-[rgba(233,238,246,0.92)]">
                    {hours.map((hour) => (
                      <div key={`${day.key}-${hour}`} className="border-b border-[rgba(233,238,246,0.92)]" style={{ height: `${rowHeight}px` }} />
                    ))}
                    {entries.map((entry) => {
                      const top = entry.start * rowHeight + 2;
                      const height = Math.max((entry.end - entry.start) * rowHeight - 4, 18);
                      const width = entry.lane === 0 ? "calc(50% - 6px)" : "calc(50% - 8px)";
                      return (
                        <div
                          key={`${day.key}-${entry.label}-${entry.lane}`}
                          className={cn(
                            "absolute overflow-hidden rounded-[0.75rem] border px-2 py-1.5 text-[9px] font-semibold shadow-[0_8px_18px_rgba(15,23,42,0.04)]",
                            entry.tone,
                          )}
                          style={{
                            top: `${top}px`,
                            left: entry.lane === 0 ? "4px" : "calc(50% + 2px)",
                            width,
                            height: `${height}px`,
                          }}
                        >
                          <div className="space-y-1 leading-4">
                            <p>{entry.label}</p>
                            {height > 52 ? <p>{entry.label}</p> : null}
                            {height > 84 ? <p>{entry.label}</p> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 border-t border-[rgba(233,238,246,0.92)] bg-[rgba(248,251,255,0.8)] p-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((item) => (
              <div key={item.label} className="rounded-[1.1rem] border border-[rgba(223,231,243,0.9)] bg-white px-5 py-4">
                <p className="min-h-[2.75rem] text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">{item.label}</p>
                <p className="mt-3 whitespace-nowrap text-[1.05rem] font-medium text-[var(--color-heading)] sm:text-[1.9rem] sm:font-extrabold sm:tracking-[-0.05em]">{item.value}</p>
                <p className="mt-2 text-[11px] font-medium text-[var(--color-text-muted)] sm:text-[12px]">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniAvatar({ initials }: { initials: string }) {
  return (
    <div className="grid size-10 place-items-center rounded-full bg-[linear-gradient(135deg,#1d4ed8,#22c55e)] text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)]">
      {initials}
    </div>
  );
}

function PortraitVisual({ variant }: { variant: "owner" | "manager" }) {
  const isOwner = variant === "owner";

  return (
    <div
      className={cn(
        "relative h-[260px] w-full overflow-hidden rounded-[1.1rem]",
        isOwner
          ? "bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.78),transparent_28%),linear-gradient(135deg,#dbeafe_0%,#eef5ff_44%,#d6e8ff_100%)]"
          : "bg-[radial-gradient(circle_at_68%_18%,rgba(255,255,255,0.74),transparent_28%),linear-gradient(135deg,#dcfce7_0%,#effcf4_42%,#daf7e7_100%)]",
      )}
    >
      <div className="absolute inset-x-6 bottom-0 top-10 rounded-[1.2rem] bg-white/34 blur-[1px]" />
      <div
        className={cn(
          "absolute bottom-0 left-1/2 h-[62%] w-[54%] -translate-x-1/2 rounded-t-[3rem]",
          isOwner ? "bg-[linear-gradient(180deg,#475569,#1f2937)]" : "bg-[linear-gradient(180deg,#0f766e,#164e63)]",
        )}
      />
      <div className="absolute bottom-[48%] left-1/2 h-[30%] w-[26%] -translate-x-1/2 rounded-[2rem] bg-[#f2c9a6]" />
      <div className="absolute bottom-[56%] left-1/2 h-[26%] w-[30%] -translate-x-1/2 rounded-full bg-[#f5d3b5]" />
      <div
        className={cn(
          "absolute bottom-[64%] left-1/2 h-[20%] w-[32%] -translate-x-1/2 rounded-[45%_45%_40%_40%]",
          isOwner ? "bg-[linear-gradient(180deg,#4b5563,#111827)]" : "bg-[linear-gradient(180deg,#d1a679,#f4d4aa)]",
        )}
      />
      <div
        className={cn(
          "absolute bottom-[18%] left-1/2 h-[25%] w-[22%] -translate-x-1/2 rounded-[1rem]",
          isOwner ? "bg-[linear-gradient(180deg,#e2e8f0,#f8fafc)]" : "bg-[linear-gradient(180deg,#1f2937,#0f172a)]",
        )}
      />
      {isOwner ? (
        <div className="absolute bottom-[11%] left-1/2 h-[14%] w-[26%] -translate-x-1/2 rounded-[1rem] border border-white/70 bg-[#2563eb]/92" />
      ) : (
        <div className="absolute bottom-[15%] left-[56%] h-[16%] w-[22%] rounded-[0.9rem] border border-white/70 bg-[#111827]/92 shadow-[0_10px_20px_rgba(15,23,42,0.18)]" />
      )}
      <div className="absolute inset-x-4 bottom-4 h-16 rounded-[1rem] bg-white/42 backdrop-blur-sm" />
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="relative max-w-[700px] overflow-hidden rounded-[1.75rem] border border-[rgba(225,232,243,0.95)] bg-[linear-gradient(145deg,#ffffff_0%,#f7fbff_52%,#eef8f2_100%)] p-3 shadow-[0_24px_64px_rgba(15,23,42,0.07)] transition-all duration-500 hover:shadow-[0_34px_84px_rgba(15,23,42,0.10)] sm:p-4">
      <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-[rgba(37,99,235,0.08)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-0 h-32 w-32 rounded-full bg-[rgba(34,197,94,0.10)] blur-3xl" />
      <div className="relative grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="rounded-[1.35rem] border border-[rgba(223,231,243,0.95)] bg-white px-3.5 py-3.5 shadow-[0_14px_30px_rgba(15,23,42,0.05)] sm:px-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2563eb]">Tydzie? gotowy</p>
              <p className="mt-1.5 max-w-[15rem] text-[1.05rem] font-extrabold tracking-[-0.05em] text-[var(--color-heading)] sm:text-[1.15rem]">
                Grafik gotowy w 3 minuty
              </p>
            </div>
            <div className="shrink-0 rounded-full bg-[rgba(37,99,235,0.08)] px-2.5 py-1 text-[10px] font-bold text-[#2563eb]">26 maja</div>
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {[
              { title: "Rano", subtitle: "Stare Miasto ? 06:30 - 12:30", people: ["Ada", "Marta"], tone: "bg-[rgba(37,99,235,0.08)] text-[#2563eb]" },
              { title: "Po po?udniu", subtitle: "Stare Miasto ? 12:30 - 18:00", people: ["Kamil", "Julia"], tone: "bg-[rgba(34,197,94,0.10)] text-[#16a34a]" },
            ].map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.38, delay: index * 0.08 }}
                className="rounded-[1rem] border border-[rgba(229,235,245,0.92)] bg-[rgba(249,251,255,0.88)] p-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-[var(--color-heading)]">{card.title}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--color-text-muted)]">{card.subtitle}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.10em]", card.tone)}>live</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {card.people.map((person) => (
                    <span key={person} className="rounded-full border border-[rgba(223,231,243,0.95)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--color-heading)]">
                      {person}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ["Zmiany", "14 / 15"],
              ["Koszt", "28,6%"],
              ["Pro?by", "3"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[0.95rem] border border-[rgba(229,235,245,0.92)] bg-white px-2.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</p>
                <p className="mt-1.5 text-[15px] font-extrabold tracking-[-0.04em] text-[var(--color-heading)]">{value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="grid gap-2.5">
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.42, delay: 0.06 }}
            className="rounded-[1.2rem] border border-[rgba(229,235,245,0.92)] bg-white px-3 py-3 shadow-[0_14px_30px_rgba(15,23,42,0.05)]"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#16a34a]">Pro?by o zmian?</p>
            <div className="mt-2.5 space-y-2">
              {[
                ["Julia", "zamiana sobota"],
                ["Tomek", "p??niejszy start"],
                ["Micha?", "wolne niedziela"],
              ].map(([name, text]) => (
                <div key={name} className="rounded-[0.9rem] border border-[rgba(229,235,245,0.92)] bg-[rgba(249,251,255,0.88)] px-2.5 py-2">
                  <p className="text-[13px] font-bold text-[var(--color-heading)]">{name}</p>
                  <p className="mt-1 text-[11px] leading-4 text-[var(--color-text-muted)]">{text}</p>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.42, delay: 0.14 }}
            className="rounded-[1.2rem] border border-[rgba(229,235,245,0.92)] bg-[linear-gradient(180deg,#2563eb,#1d4ed8)] px-3 py-3 text-white shadow-[0_16px_34px_rgba(37,99,235,0.20)]"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Dzisiaj</p>
            <p className="mt-1.5 text-[1.7rem] font-extrabold tracking-[-0.06em]">12 450 PLN</p>
            <p className="mt-1.5 text-[12px] leading-5 text-white/82">Przych?d wpisany i dzie? pod kontrol?.</p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function PlannerFlowPreview() {
  return (
    <div className="rounded-[1.9rem] border border-[rgba(225,232,243,0.95)] bg-white p-4 shadow-[0_24px_64px_rgba(15,23,42,0.07)] transition-all duration-500 hover:shadow-[0_32px_80px_rgba(15,23,42,0.1)] sm:p-5">
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[1.45rem] border border-[rgba(229,235,245,0.92)] bg-[rgba(249,251,255,0.78)] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#2563eb]">Planowanie</p>
          <p className="mt-2 text-[1.35rem] font-extrabold tracking-[-0.05em] text-[var(--color-heading)]">
            Ułóż tydzień bez grzebania w skomplikowanej siatce
          </p>
          <div className="mt-4 space-y-3">
            {[
              {
                step: "1",
                title: "Wybierz dzień i lokal",
                body: "Na starcie widzisz tylko to, co trzeba obsadzić dzisiaj albo w tym tygodniu.",
              },
              {
                step: "2",
                title: "Przypisz role i ludzi",
                body: "System pokazuje dostępne osoby, a nie całą trudną tabelę do rozszyfrowania.",
              },
              {
                step: "3",
                title: "Publikuj i reaguj",
                body: "Po publikacji zespół od razu widzi zmianę, a prośby wracają w jednym miejscu.",
              },
            ].map((item) => (
              <div key={item.step} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 rounded-[1rem] border border-[rgba(229,235,245,0.92)] bg-white px-3 py-3">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-[rgba(37,99,235,0.10)] text-sm font-extrabold text-[#2563eb]">
                  {item.step}
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--color-heading)]">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          <div className="rounded-[1.45rem] border border-[rgba(229,235,245,0.92)] bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[var(--color-heading)]">Niedziela, 26 maja</p>
                <p className="text-xs text-[var(--color-text-muted)]">Zmiana śniadaniowa i popołudniowa</p>
              </div>
              <span className="rounded-full bg-[rgba(34,197,94,0.10)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#16a34a]">
                gotowe
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                ["06:30 - 12:30", "Barista", ["Ada", "Marta"]],
                ["12:30 - 18:00", "Cashier", ["Julia"]],
                ["12:30 - 18:00", "Barista", ["Kamil", "Ola"]],
              ].map(([time, role, people]) => (
                <div key={`${time}-${role}`} className="rounded-[1rem] border border-[rgba(229,235,245,0.92)] bg-[rgba(249,251,255,0.88)] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[var(--color-heading)]">{time}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{role}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {(people as string[]).map((person) => (
                        <span key={person} className="rounded-full border border-[rgba(223,231,243,0.95)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--color-heading)]">
                          {person}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Do obsadzenia", "1 slot"],
              ["Gotowe do publikacji", "6 zmian"],
              ["Koszt dnia", "1 280 PLN"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[1.15rem] border border-[rgba(229,235,245,0.92)] bg-[rgba(249,251,255,0.88)] px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</p>
                <p className="mt-2 text-base font-extrabold tracking-[-0.04em] text-[var(--color-heading)]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlannerPreview() {
  return <PlannerFlowPreview />;
}
function RequestsPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5 }}
      className="rounded-[1.9rem] border border-[rgba(225,232,243,0.95)] bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.07)]"
    >
      <div className="flex flex-wrap items-center gap-5 border-b border-[rgba(233,238,246,0.92)] pb-4">
        {["Do akceptacji (3)", "Zaakceptowane", "Odrzucone"].map((item, index) => (
          <button
            key={item}
            type="button"
            className={cn(
              "text-sm font-semibold transition-colors duration-200 hover:text-[#2563eb]",
              index === 0 ? "text-[#2563eb]" : "text-[var(--color-text-muted)]",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {requestRows.map((row, index) => (
          <motion.div
            key={row.name}
            initial={{ opacity: 0, x: -15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
            whileHover={{
              x: 6,
              borderColor: "rgba(37,99,235,0.22)",
              boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
            }}
            className="grid gap-3 rounded-[1.1rem] border border-[rgba(233,238,246,0.92)] px-4 py-4 sm:grid-cols-[1.05fr_1.15fr_1fr_0.9fr] sm:items-center cursor-pointer transition-all duration-200"
          >
            <div>
              <p className="text-sm font-bold text-[var(--color-heading)]">{row.name}</p>
            </div>
            <p className="text-sm text-[var(--color-heading)]">{row.slot}</p>
            <p className="text-sm font-semibold text-[#2563eb]">{row.request}</p>
            <p className="text-sm text-[var(--color-text-muted)]">{row.reason}</p>
          </motion.div>
        ))}
      </div>
      <button type="button" className="mt-4 text-sm font-semibold text-[#2563eb] hover:translate-x-1.5 transition-all duration-200 flex items-center gap-1.5">
        Pokaż wszystkie <span>→</span>
      </button>
    </motion.div>
  );
}

function RevenuePreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5 }}
      className="rounded-[1.9rem] border border-[rgba(225,232,243,0.95)] bg-white p-4 shadow-[0_24px_64px_rgba(15,23,42,0.07)] sm:p-5"
    >
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <div className="grid gap-3 sm:grid-cols-3">
            {heroMetrics.slice(0, 3).map((item, index) => (
              <motion.div
                key={item.label}
                whileHover={{ y: -3, borderColor: "rgba(37,99,235,0.18)" }}
                className="rounded-[1.1rem] border border-[rgba(223,231,243,0.9)] bg-white px-4 py-3 transition-all duration-200 cursor-pointer"
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{item.label}</p>
                <p className="mt-2 text-[1.55rem] font-extrabold tracking-[-0.05em] text-[var(--color-heading)]">{item.value}</p>
                <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">{item.note}</p>
              </motion.div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[1.2rem] border border-[rgba(229,235,245,0.92)] bg-[rgba(249,251,255,0.88)] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Przychód w ostatni tydzień (PLN)</p>
              <svg viewBox="0 0 280 120" className="mt-4 h-[120px] w-full">
                <motion.path
                  d="M0 100 L28 88 L56 92 L84 54 L112 66 L140 40 L168 78 L196 58 L224 62 L252 32 L280 44"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                />
                <motion.path
                  d="M0 100 L28 88 L56 92 L84 54 L112 66 L140 40 L168 78 L196 58 L224 62 L252 32 L280 44 L280 120 L0 120 Z"
                  fill="rgba(37,99,235,0.10)"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 1.2 }}
                />
              </svg>
            </div>
            <div className="rounded-[1.2rem] border border-[rgba(229,235,245,0.92)] bg-[rgba(249,251,255,0.88)] p-4 flex flex-col justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Koszt pracy według roli</p>
              <div className="mt-4 flex items-center justify-center">
                <motion.div
                  className="size-28 rounded-full shadow-inner"
                  style={{
                    background:
                      "conic-gradient(#2563eb 0deg 120deg, #22c55e 120deg 220deg, #f59e0b 220deg 310deg, #8b5cf6 310deg 360deg)",
                  }}
                  initial={{ scale: 0.8, rotate: -95, opacity: 0 }}
                  whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, type: "spring", stiffness: 85, delay: 0.2 }}
                >
                  <div className="m-auto mt-[18px] size-[76px] rounded-full bg-white shadow-inner flex items-center justify-center">
                    <span className="text-[10px] font-bold text-[var(--color-text-muted)]">Podział %</span>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-[rgba(229,235,245,0.92)] bg-[rgba(249,251,255,0.88)] p-4 xl:col-span-5 flex flex-col justify-between">
          <div>
            <p className="text-sm font-bold text-[var(--color-heading)]">Wpis przychodu</p>
            <div className="mt-4 space-y-3">
              {[
                ["Lokal", "Biuro Warszawa"],
                ["Data", "24.05.2034"],
                ["Przychód (PLN)", "12450"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[0.95rem] border border-[rgba(229,235,245,0.92)] bg-white px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</p>
                  <p className="mt-1.5 text-sm font-semibold text-[var(--color-heading)]">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <Button className="mt-4 w-full rounded-[0.95rem] hover:scale-[1.01] active:scale-[0.98] transition-all duration-200">Zapisz</Button>
        </div>
      </div>
    </motion.div>
  );
}

function WorkspacePreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5 }}
      className="rounded-[1.9rem] border border-[rgba(225,232,243,0.95)] bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.07)]"
    >
      <div className="flex gap-5 border-b border-[rgba(233,238,246,0.92)] pb-4">
        {["Zadania", "Notatki", "Zespół"].map((tab, index) => (
          <button key={tab} type="button" className={cn("text-sm font-semibold transition-colors duration-200 hover:text-[#2563eb]", index === 0 ? "text-[#2563eb]" : "text-[var(--color-text-muted)]")}>
            {tab}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {taskRows.map(([title, date, owner], index) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
            whileHover={{
              scale: 1.02,
              borderColor: "rgba(37,99,235,0.22)",
              boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
            }}
            className="grid grid-cols-[22px_1fr_auto_auto] items-center gap-3 rounded-[1rem] border border-[rgba(233,238,246,0.92)] px-4 py-3 cursor-pointer transition-all duration-200"
          >
            <span className="size-4 rounded-[0.35rem] border border-[rgba(185,196,214,0.9)]" />
            <span className="text-sm font-semibold text-[var(--color-heading)]">{title}</span>
            <span className="text-sm text-[var(--color-text-muted)]">{date}</span>
            <span className="text-sm text-[var(--color-text-muted)]">{owner}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function FaqItem({ index, question, openIndex, onToggle }: { index: number; question: string; openIndex: number | null; onToggle: (index: number) => void }) {
  const isOpen = openIndex === index;
  return (
    <div className="rounded-[1.1rem] border border-[rgba(227,233,243,0.96)] bg-white">
      <button
        type="button"
        onClick={() => onToggle(index)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-[15px] font-semibold text-[var(--color-heading)]">{question}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-[var(--color-text-muted)] transition-transform", isOpen ? "rotate-180" : "")} />
      </button>
      {isOpen ? (
        <div className="border-t border-[rgba(233,238,246,0.92)] px-5 py-4 text-sm leading-7 text-[var(--color-text-muted)]">
          GastrOWO upraszcza planowanie, dostępność zespołu i codzienną operację restauracji bez dokładania zbędnych kroków.
        </div>
      ) : null}
    </div>
  );
}

export function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div lang="pl" className="min-h-dvh overflow-x-clip bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_42%,#eef5fb_100%)] text-[var(--color-text)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_15%_8%,rgba(37,99,235,0.12),transparent_26%),radial-gradient(circle_at_85%_12%,rgba(34,197,94,0.12),transparent_24%)]" />

      <header className="py-6">
        <SectionContainer>
          <div className="flex items-center justify-between gap-6">
            <Link to="/" className="shrink-0">
              <LandingWordmark />
            </Link>
            <nav className="hidden lg:block">
              <ul className="flex items-center">
                {navItems.map((item) => (
                  <li key={item.href} className="mr-9 last:mr-0">
                    <a href={item.href} className="text-[15px] font-semibold text-[var(--color-heading)] transition hover:text-[#2563eb]">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="hidden items-center gap-4 md:flex">
              <Link to="/login?mode=signin" className="text-[15px] font-semibold text-[var(--color-heading)] transition hover:text-[#2563eb]">
                Logowanie
              </Link>
              <Button asChild className="rounded-[1rem] px-5">
                <Link to="/login?mode=onboarding">
                  Zacznij za darmo <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </SectionContainer>
      </header>

      <main className="pb-16 sm:pb-20">
        <section className="pt-0 sm:pt-2">
          <SectionContainer>
            <div className="flex min-h-[calc(100dvh-6.75rem)] items-center py-4 sm:py-6">
              <motion.div {...pageReveal} className="max-w-[56rem]">
                <h1 className="text-[2.75rem] font-extrabold leading-[0.98] tracking-[-0.08em] text-[var(--color-heading)] sm:text-[3.65rem] lg:text-[4.25rem]">
                  Kontroluj grafik,
                  <br />
                  <span className="bg-[linear-gradient(90deg,#2563eb_0%,#2563eb_42%,#16a34a_70%,#22c55e_100%)] bg-clip-text text-transparent">
                    zespół i operacje
                  </span>
                  <br />
                  restauracji bez chaosu.
                </h1>
                <p className="mt-5 max-w-[32rem] text-[1.02rem] leading-7 text-[var(--color-text-muted)]">
                  GastrOWO to nowoczesny workspace dla restauracji. Planuj zmiany, zarządzaj zespołem, śledź przychody i trzymaj wszystko w jednym miejscu.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="rounded-[1rem] px-6">
                    <Link to="/login?mode=onboarding">
                      Zacznij onboarding <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="secondary"
                    size="lg"
                    className="rounded-[1rem] border border-[rgba(215,224,238,0.95)] bg-white px-6 shadow-[0_10px_26px_rgba(15,23,42,0.04)]"
                  >
                    <a href="#produkt">
                      <PlayCircle className="size-4 text-[#2563eb]" /> Zobacz produkt
                    </a>
                  </Button>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  {quickPoints.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex items-start gap-3">
                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[rgba(37,99,235,0.08)] text-[#2563eb]">
                          <Icon className="size-4" />
                        </span>
                        <div>
                          <p className="text-sm font-bold text-[var(--color-heading)]">{item.title}</p>
                          <p className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">{item.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          </SectionContainer>
        </section>

        <motion.section {...pageReveal} className="mt-8 sm:mt-12">
          <SectionContainer>
            <div className="grid gap-5 rounded-[1.8rem] border border-[rgba(227,233,243,0.96)] bg-white px-6 py-6 shadow-[0_18px_54px_rgba(15,23,42,0.05)] md:grid-cols-3">
              {stripItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-start gap-4">
                    <span className={cn("grid size-12 shrink-0 place-items-center rounded-full", item.tone)}>
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <p className="text-xl font-bold tracking-[-0.04em] text-[var(--color-heading)]">{item.title}</p>
                      <p className="mt-2 text-[15px] leading-7 text-[var(--color-text-muted)]">{item.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionContainer>
        </motion.section>

        <section id="produkt" className="pt-20 sm:pt-24">
          <SectionContainer>
            <div className="grid gap-10 xl:grid-cols-12 xl:items-center">
              <motion.div {...pageReveal} className="max-w-[30rem] xl:col-span-4">
                <Eyebrow>PLANOWANIE</Eyebrow>
                <h2 className="mt-4 text-[2.35rem] font-extrabold leading-[1.02] tracking-[-0.07em] text-[var(--color-heading)] sm:text-[3rem]">
                  Grafik tygodniowy
                  <br />
                  w kilka minut
                </h2>
                <p className="mt-5 text-lg leading-8 text-[var(--color-text-muted)]">
                  Przeciągaj zmiany, kopiuj wzorce, przypisuj role. Od razu widzisz koszt pracy, liczbę godzin i dostępność ludzi.
                </p>
                <CheckList items={sectionPlannerBullets} />
              </motion.div>
              <motion.div {...pageReveal} className="xl:col-span-8">
                <PlannerPreview />
              </motion.div>
            </div>
          </SectionContainer>
        </section>

        <section className="pt-16 sm:pt-20">
          <SectionContainer>
            <div className="grid gap-10 xl:grid-cols-12 xl:items-center">
              <motion.div {...pageReveal} className="order-2 xl:order-1 xl:col-span-6">
                <RequestsPreview />
              </motion.div>
              <motion.div {...pageReveal} className="order-1 max-w-[31rem] xl:order-2 xl:col-span-6 xl:justify-self-end">
                <Eyebrow>PROŚBY I DOSTĘPNOŚĆ</Eyebrow>
                <h2 className="mt-4 text-[2.35rem] font-extrabold leading-[1.02] tracking-[-0.07em] text-[var(--color-heading)] sm:text-[3rem]">
                  Prośby o zmiany
                  <br />
                  i dostępność bez stresu
                </h2>
                <p className="mt-5 text-lg leading-8 text-[var(--color-text-muted)]">
                  Pracownicy składają prośby, Ty decydujesz. Wszystko w jednym miejscu, bez chaotycznych wiadomości.
                </p>
                <CheckList items={sectionRequestsBullets} />
              </motion.div>
            </div>
          </SectionContainer>
        </section>

        <section className="pt-16 sm:pt-20">
          <SectionContainer>
            <div className="grid gap-10 xl:grid-cols-12 xl:items-center">
              <motion.div {...pageReveal} className="max-w-[31rem] xl:col-span-4">
                <Eyebrow>PRZYCHÓD I KOSZTY PRACY</Eyebrow>
                <h2 className="mt-4 text-[2.35rem] font-extrabold leading-[1.02] tracking-[-0.07em] text-[var(--color-heading)] sm:text-[3rem]">
                  Kontroluj przychód
                  <br />
                  i koszty pracy każdego dnia
                </h2>
                <p className="mt-5 text-lg leading-8 text-[var(--color-text-muted)]">
                  Wpisuj przychód dzienny i od razu widzisz wpływ na koszty pracy oraz średni przychód na godzinę.
                </p>
                <CheckList items={sectionRevenueBullets} />
              </motion.div>
              <motion.div {...pageReveal} className="xl:col-span-8">
                <RevenuePreview />
              </motion.div>
            </div>
          </SectionContainer>
        </section>

        <section className="pt-16 sm:pt-20">
          <SectionContainer>
            <div className="grid gap-10 xl:grid-cols-12 xl:items-center">
              <motion.div {...pageReveal} className="order-2 xl:order-1 xl:col-span-6">
                <WorkspacePreview />
              </motion.div>
              <motion.div {...pageReveal} className="order-1 max-w-[31rem] xl:order-2 xl:col-span-6 xl:justify-self-end">
                <Eyebrow>ZADANIA, NOTATKI I ZESPÓŁ</Eyebrow>
                <h2 className="mt-4 text-[2.35rem] font-extrabold leading-[1.02] tracking-[-0.07em] text-[var(--color-heading)] sm:text-[3rem]">
                  Współpraca i komunikacja
                  <br />
                  w jednym workspace
                </h2>
                <p className="mt-5 text-lg leading-8 text-[var(--color-text-muted)]">
                  Zadania operacyjne, ważne notatki i kontakty zespołu zawsze pod ręką.
                </p>
                <CheckList items={sectionWorkspaceBullets} />
              </motion.div>
            </div>
          </SectionContainer>
        </section>

        <section id="jak-to-dziala" className="pt-20 sm:pt-24">
          <SectionContainer>
            <motion.div {...pageReveal} className="text-center">
              <h2 className="text-[2.45rem] font-extrabold tracking-[-0.07em] text-[var(--color-heading)] sm:text-[3.35rem]">Jak to działa?</h2>
            </motion.div>
            <div className="relative mt-10 grid gap-6 lg:grid-cols-3">
              <div className="pointer-events-none absolute left-[16.5%] right-[16.5%] top-8 hidden border-t border-dashed border-[rgba(197,209,226,0.9)] lg:block" />
              {workflowSteps.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.div key={item.title} {...pageReveal} className="relative rounded-[1.75rem] border border-[rgba(227,233,243,0.96)] bg-white px-6 py-6 shadow-[0_18px_54px_rgba(15,23,42,0.05)]">
                    <div className="flex items-center gap-4">
                      <span className={cn("grid size-14 shrink-0 place-items-center rounded-full", item.tone)}>
                        <Icon className="size-6" />
                      </span>
                      <span className="grid size-8 place-items-center rounded-full bg-[#2563eb] text-sm font-extrabold text-white">{index + 1}</span>
                    </div>
                    <p className="mt-5 text-xl font-extrabold tracking-[-0.04em] text-[var(--color-heading)]">{item.title}</p>
                    <p className="mt-2 text-[15px] leading-7 text-[var(--color-text-muted)]">{item.body}</p>
                  </motion.div>
                );
              })}
            </div>
          </SectionContainer>
        </section>

        <section id="dla-kogo" className="pt-20 sm:pt-24">
          <SectionContainer>
            <div className="grid gap-5 xl:grid-cols-2">
              {audienceCards.map((card) => (
                <motion.div
                  key={card.title}
                  {...pageReveal}
                  className={cn("overflow-hidden rounded-[2rem] border p-6 shadow-[0_18px_54px_rgba(15,23,42,0.05)]", card.accent)}
                >
                  <div className="grid gap-6 md:grid-cols-[1fr_220px] md:items-end">
                    <div>
                      <p className="text-[0.82rem] font-extrabold uppercase tracking-[0.14em]">{card.badge}</p>
                      <h3 className="mt-4 text-[2rem] font-extrabold leading-[1.04] tracking-[-0.06em] text-[var(--color-heading)]">{card.title}</h3>
                      <div className="mt-5 space-y-3">
                        {card.bullets.map((item) => (
                          <div key={item} className="flex items-start gap-3 text-[15px] leading-6 text-[var(--color-heading)]">
                            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/85">
                              <Check className="size-3.5" />
                            </span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/82 p-2 shadow-[0_16px_34px_rgba(15,23,42,0.07)]">
                      <PortraitVisual variant={card.portrait} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </SectionContainer>
        </section>

        <section id="cennik" className="pt-16 sm:pt-20">
          <SectionContainer>
            <motion.div
              {...pageReveal}
              className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#2563eb_0%,#1d4ed8_42%,#2563eb_100%)] px-6 py-7 shadow-[0_24px_70px_rgba(37,99,235,0.28)] sm:px-8 sm:py-8"
            >
              <div className="grid gap-8 xl:grid-cols-[1.15fr_1fr_auto] xl:items-center">
                <div>
                  <h2 className="text-[2.2rem] font-extrabold leading-[1.02] tracking-[-0.07em] text-slate-950 sm:text-[2.8rem]">
                    Proste ceny. Szybki start.
                    <br />
                    Zero zbędnych formalności.
                  </h2>
                  <p className="mt-4 max-w-[34rem] text-[17px] leading-8 text-slate-900/84">
                    Wypróbuj GastrOWO za darmo i przekonaj się, jak uporządkuje Twoją restaurację.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["14 dni za darmo", "Pełny dostęp bez karty płatniczej"],
                    ["Anuluj w każdej chwili", "Bez zobowiązań, bez ukrytych opłat"],
                  ].map(([title, body]) => (
                    <div key={title} className="rounded-[1.25rem] border border-white/35 bg-white/78 px-4 py-4 backdrop-blur-sm">
                      <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-full border border-slate-300/70 bg-white/80 text-slate-950">
                          <CircleDollarSign className="size-5" />
                        </span>
                        <p className="text-base font-bold text-slate-950">{title}</p>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-900/78">{body}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-[1.3rem] bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
                  <Button asChild className="h-auto rounded-[1rem] px-6 py-4 text-base">
                    <Link to="/login?mode=onboarding">
                      Zacznij za darmo <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <p className="px-4 pb-2 pt-3 text-center text-sm font-medium text-[var(--color-text-muted)]">Start w 2 minuty</p>
                </div>
              </div>
            </motion.div>
          </SectionContainer>
        </section>

        <section id="faq" className="pt-20 sm:pt-24">
          <SectionContainer>
            <motion.div {...pageReveal} className="text-center">
              <h2 className="text-[2.45rem] font-extrabold tracking-[-0.07em] text-[var(--color-heading)] sm:text-[3.2rem]">Najczęściej zadawane pytania</h2>
            </motion.div>
            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              {faqItems.map((question, index) => (
                <motion.div key={question} {...pageReveal}>
                  <FaqItem index={index} question={question} openIndex={openFaq} onToggle={(value) => setOpenFaq(openFaq === value ? null : value)} />
                </motion.div>
              ))}
            </div>
          </SectionContainer>
        </section>
      </main>

      <footer className="border-t border-[rgba(227,233,243,0.96)] bg-white/88 py-10">
        <SectionContainer>
          <div className="grid gap-10 xl:grid-cols-[1.1fr_0.9fr_0.95fr]">
            <div className="max-w-[20rem]">
              <LandingWordmark size="sm" />
              <p className="mt-4 text-[15px] leading-7 text-[var(--color-text-muted)]">
                Nowoczesny workspace dla restauracji. Grafik, zespół, przychody i operacje w jednym miejscu.
              </p>
              <div className="mt-5 flex items-center gap-4 text-sm font-semibold text-[var(--color-heading)]">
                <span>FB</span>
                <span>IG</span>
                <span>IN</span>
              </div>
            </div>

            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[var(--color-heading)]">Produkt</p>
                <div className="mt-4 space-y-3 text-sm text-[var(--color-text-muted)]">
                  <p>Grafik</p>
                  <p>Zespół</p>
                  <p>Raporty</p>
                  <p>Zadania i notatki</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[var(--color-heading)]">Firma</p>
                <div className="mt-4 space-y-3 text-sm text-[var(--color-text-muted)]">
                  <p>O nas</p>
                  <p>Blog</p>
                  <p>Kontakt</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[var(--color-heading)]">Wsparcie</p>
                <div className="mt-4 space-y-3 text-sm text-[var(--color-text-muted)]">
                  <p>Pomoc</p>
                  <p>FAQ</p>
                  <p>Polityka prywatności</p>
                  <p>Regulamin</p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-[rgba(227,233,243,0.96)] bg-[rgba(248,251,255,0.92)] p-6 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
              <p className="text-xl font-extrabold leading-[1.1] tracking-[-0.05em] text-[var(--color-heading)]">
                Gotowy, aby uporządkować
                <br />
                swoją restaurację?
              </p>
              <Button asChild className="mt-5 w-full rounded-[1rem]">
                <Link to="/login?mode=onboarding">Zacznij onboarding</Link>
              </Button>
            </div>
          </div>
          <div className="mt-8 border-t border-[rgba(227,233,243,0.96)] pt-5 text-center text-sm text-[var(--color-text-muted)]">
            © 2034 GastrOWO. Wszelkie prawa zastrzeżone.
          </div>
        </SectionContainer>
      </footer>
    </div>
  );
}
