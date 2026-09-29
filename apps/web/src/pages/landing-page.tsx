import type { ReactNode } from "react";
import { ArrowRight, Bell, CalendarCheck2, Check, ChevronDown, Clock3, Facebook, FileSpreadsheet, Instagram, PieChart, Repeat2, Scale, Users, type LucideIcon } from "lucide-react";
import { legalLinks } from "@/lib/legal-links";
import { Link } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";
import { CookieConsent } from "@/components/cookie-consent";
import { DevLoginButton } from "@/components/dev-login-button";
import { Segmented } from "@/components/ui/segmented";
import { type Currency, formatMoney } from "@/lib/format";
import { type Lang, useLanguage } from "@/lib/i18n";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import { PLAN_PRICE, PRO_EXTRA_LOCATION_PRICE, SEVENSHIFTS_USD, monthlyPrice, plans } from "@/lib/plans";
import { cn } from "@/lib/utils";

const SIGNUP_URL = "/login?mode=onboarding";
const SIGNIN_URL = "/login?mode=signin";

type Copy = {
  nav: { features: string; pricing: string; faq: string; signIn: string; start: string };
  hero: { title: string; highlight: string; body: string; primary: string; secondary: string; note: (price: string) => string };
  preview: { title: string; published: string; roles: [string, string, string, string]; laborCost: string; hours: string; rules: string; days: string[] };
  featuresTitle: string;
  features: Array<{ icon: LucideIcon; title: string; body: string }>;
  stepsTitle: string;
  steps: Array<{ title: string; body: string }>;
  pricingTitle: string;
  pricingBody: string;
  pricingCta: { free: string; paid: string };
  mostPopular: string;
  compare: (percent: number) => string;
  faqTitle: string;
  faq: Array<{ q: string; a: string }>;
  finalTitle: string;
  finalBody: string;
  legal: { terms: string; privacy: string; cookies: string };
};

const COPY: Record<Lang, Copy> = {
  en: {
    nav: { features: "Features", pricing: "Pricing", faq: "FAQ", signIn: "Sign in", start: "Start free" },
    hero: {
      title: "Restaurant scheduling",
      highlight: "in 10 minutes",
      body: "Availability, overtime and labor cost are handled for you. You just hit publish.",
      primary: "Start free",
      secondary: "See how it works",
      note: (price) => `30-day Pro trial · no card · from ${price} a month`,
    },
    preview: {
      title: "Schedule · May 20–26",
      published: "Published",
      roles: ["Kitchen", "Floor", "Bar", "Manager"],
      laborCost: "Labor cost 28.6%",
      hours: "186 h",
      rules: "No overtime",
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    },
    featuresTitle: "Everything a shift needs. Nothing more.",
    features: [
      { icon: CalendarCheck2, title: "Schedules build themselves", body: "From availability, positions and priorities. You tweak and publish." },
      { icon: Scale, title: "Overtime under control", body: "Auto-scheduling keeps everyone under 40 hours a week, and you get a warning before anyone goes over." },
      { icon: Users, title: "One person, many positions", body: "A server who also tends bar gets both, each with its own pay rate." },
      { icon: Repeat2, title: "Swaps without group chats", body: "Staff ask to swap or pick up a shift in the app. You approve with one tap." },
      { icon: Clock3, title: "Time clock: phone or tablet", body: "Staff clock in from their phone or with a PIN on the tablet by the door, breaks included. On-time punches approve themselves." },
      { icon: Bell, title: "An app on every phone", body: "Add it to the Home Screen and get a push the moment a schedule, swap or task comes in." },
      { icon: PieChart, title: "Live labor cost", body: "Enter the day's sales and see what share goes to wages." },
      { icon: FileSpreadsheet, title: "Payroll export and calendars", body: "A CSV for your accountant, and every shift in each employee's Google or Apple calendar." },
    ],
    stepsTitle: "Your first schedule today",
    steps: [
      { title: "Create an account", body: "Restaurant name and email. No credit card." },
      { title: "Invite your team", body: "Paste your team from a spreadsheet. Everyone joins from a link and shares their availability." },
      { title: "Publish the schedule", body: "Generate the week, adjust it and send it out." },
    ],
    pricingTitle: "One price for your whole team",
    pricingBody: "Never per person. Free forever for one small restaurant, Pro covers up to three locations. Every new account starts with 30 days of Pro.",
    pricingCta: { free: "Start free", paid: "Try 30 days free" },
    mostPopular: "Most popular",
    compare: (percent) => `${percent}% less than 7shifts`,
    faqTitle: "Questions",
    faq: [
      {
        q: "How much does it cost?",
        a: "Free covers one location and up to 15 people, forever. Starter is $26 a month for one location and up to 30 people. Pro is $58 a month for up to three locations with no people limit, and $15 for each location after that. Yearly billing gets you two months free.",
      },
      { q: "Do I need a credit card to start?", a: "No. You get the full Pro plan for 30 days, then choose a paid plan or stay on Free." },
      { q: "Does my team need to install an app?", a: "No download from an app store. Staff open the invite link, set a password and can add Platofy to their Home Screen to get push notifications." },
      {
        q: "How do you handle overtime?",
        a: "Auto-scheduling avoids putting anyone over 40 hours in a week. If you assign it by hand you get a warning, and you can let auto-scheduling go over the limit in Settings.",
      },
      { q: "Can one person work different positions?", a: "Yes. Give someone several positions, pick the main one and set a rate for each. Auto-scheduling can use them in any of them." },
    ],
    finalTitle: "Build your first schedule today",
    finalBody: "30 days of Pro, free. No card, no contract.",
    legal: { terms: "Terms", privacy: "Privacy", cookies: "Cookies" },
  },
  pl: {
    nav: { features: "Funkcje", pricing: "Cennik", faq: "FAQ", signIn: "Zaloguj", start: "Zacznij za darmo" },
    hero: {
      title: "Grafik dla restauracji",
      highlight: "w 10 minut",
      body: "Dostępność zespołu, Kodeks pracy i koszt pracy liczą się same. Ty tylko publikujesz.",
      primary: "Zacznij za darmo",
      secondary: "Zobacz, jak działa",
      note: (price) => `30 dni Pro gratis · bez karty · od ${price} miesięcznie`,
    },
    preview: {
      title: "Grafik · 20–26 maja",
      published: "Opublikowany",
      roles: ["Kuchnia", "Sala", "Bar", "Manager"],
      laborCost: "Koszt pracy 28,6%",
      hours: "186 h",
      rules: "Kodeks pracy OK",
      days: ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"],
    },
    featuresTitle: "Wszystko, czego potrzebuje zmiana. Nic więcej.",
    features: [
      { icon: CalendarCheck2, title: "Grafik układa się sam", body: "Na podstawie dostępności, stanowisk i priorytetów. Ty tylko poprawiasz i publikujesz." },
      { icon: Scale, title: "Zgodny z Kodeksem pracy", body: "Pilnuje 11 h odpoczynku dobowego i 35 h tygodniowego, zanim ktoś to zauważy." },
      { icon: Users, title: "Jedna osoba, kilka stanowisk", body: "Kelner, który stoi też za barem, ma oba stanowiska i osobną stawkę dla każdego." },
      { icon: Repeat2, title: "Zamiany bez czatu", body: "Pracownicy proszą o zamianę lub przejęcie zmiany w aplikacji, a Ty akceptujesz jednym kliknięciem." },
      { icon: Clock3, title: "Odbicia z telefonu lub tabletu", body: "Wejście i wyjście z telefonu albo PIN-em na tablecie przy wejściu, z przerwami. Punktualne odbicia zatwierdzają się same." },
      { icon: Bell, title: "Aplikacja na każdym telefonie", body: "Dodaj do ekranu początkowego i dostawaj powiadomienia o grafiku, zamianach i zadaniach." },
      { icon: PieChart, title: "Koszt pracy na bieżąco", body: "Wpisz utarg dnia i od razu widzisz, jaki procent zjadają wypłaty." },
      { icon: FileSpreadsheet, title: "Eksport i kalendarz", body: "Plik CSV dla księgowej, a grafik w kalendarzu Google lub iPhone każdego pracownika." },
    ],
    stepsTitle: "Pierwszy grafik jeszcze dziś",
    steps: [
      { title: "Załóż konto", body: "Nazwa lokalu i email. Bez karty płatniczej." },
      { title: "Zaproś zespół", body: "Wklej zespół z arkusza. Każdy dołącza z linku i podaje dostępność." },
      { title: "Opublikuj grafik", body: "Wygeneruj tydzień, popraw i wyślij zespołowi." },
    ],
    pricingTitle: "Jedna cena za cały zespół",
    pricingBody: "Nigdy za osobę. Jeden mały lokal za darmo na zawsze, Pro obejmuje do trzech lokali. Każde nowe konto zaczyna od 30 dni planu Pro.",
    pricingCta: { free: "Zacznij za darmo", paid: "Wypróbuj 30 dni gratis" },
    mostPopular: "Najczęściej wybierany",
    compare: (percent) => `${percent}% taniej niż 7shifts`,
    faqTitle: "Najczęstsze pytania",
    faq: [
      {
        q: "Ile kosztuje Platofy?",
        a: "Free obejmuje jeden lokal i do 15 osób, bez limitu czasu. Starter to 99 zł miesięcznie za jeden lokal i do 30 osób. Pro to 219 zł miesięcznie za maksymalnie trzy lokale bez limitu osób, a każdy kolejny lokal kosztuje 59 zł. Rocznie 2 miesiące gratis.",
      },
      { q: "Czy potrzebuję karty płatniczej?", a: "Nie. Przez 30 dni korzystasz z pełnego planu Pro, potem wybierasz płatny plan albo zostajesz na Free." },
      { q: "Czy pracownicy muszą instalować aplikację?", a: "Nie ze sklepu. Pracownik otwiera link z zaproszenia, ustawia hasło i może dodać Platofy do ekranu początkowego, aby dostawać powiadomienia." },
      {
        q: "Czy grafik uwzględnia przepisy o czasie pracy?",
        a: "Tak. Automatyczny grafik nie przydzieli zmiany, która łamie 11 godzin odpoczynku dobowego lub 35 godzin tygodniowego. Przy ręcznej zmianie dostaniesz ostrzeżenie.",
      },
      { q: "Czy jedna osoba może pracować na kilku stanowiskach?", a: "Tak. Nadaj kilka stanowisk, wybierz główne i ustaw stawkę dla każdego. Automatyczny grafik wykorzysta każde z nich." },
    ],
    finalTitle: "Pierwszy grafik ułożysz jeszcze dziś",
    finalBody: "30 dni planu Pro za darmo. Bez karty, bez umowy.",
    legal: { terms: "Regulamin", privacy: "Prywatność", cookies: "Cookies" },
  },
  ru: {
    nav: { features: "Возможности", pricing: "Цены", faq: "Вопросы", signIn: "Войти", start: "Начать бесплатно" },
    hero: {
      title: "График для ресторана",
      highlight: "за 10 минут",
      body: "Доступность команды, переработки и затраты на персонал считаются сами. Вы только публикуете.",
      primary: "Начать бесплатно",
      secondary: "Как это работает",
      note: (price) => `30 дней Pro бесплатно · без карты · от ${price} в месяц`,
    },
    preview: {
      title: "График · 20–26 мая",
      published: "Опубликован",
      roles: ["Кухня", "Зал", "Бар", "Менеджер"],
      laborCost: "Затраты на персонал 28,6%",
      hours: "186 ч",
      rules: "Без переработок",
      days: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    },
    featuresTitle: "Всё, что нужно смене. Ничего лишнего.",
    features: [
      { icon: CalendarCheck2, title: "График строится сам", body: "По доступности, позициям и приоритетам. Вы правите и публикуете." },
      { icon: Scale, title: "Переработки под контролем", body: "Автографик держит неделю в пределах 40 часов, а перед переработкой вы видите предупреждение." },
      { icon: Users, title: "Один человек, несколько позиций", body: "Официант, который стоит и за баром, получает обе позиции, у каждой своя ставка." },
      { icon: Repeat2, title: "Обмены без чатов", body: "Сотрудники просят обмен или подхват смены в приложении, вы подтверждаете одним нажатием." },
      { icon: Clock3, title: "Отметки с телефона или планшета", body: "Приход и уход с телефона или по PIN на планшете у входа, с перерывами. Отметки по графику подтверждаются сами." },
      { icon: Bell, title: "Приложение на каждом телефоне", body: "Добавьте на экран «Домой» и получайте пуши о графике, обменах и задачах." },
      { icon: PieChart, title: "Затраты на персонал", body: "Внесите выручку за день и сразу видно, какую долю съедает зарплата." },
      { icon: FileSpreadsheet, title: "Выгрузка и календарь", body: "CSV для бухгалтера и смены в Google или Apple календаре каждого сотрудника." },
    ],
    stepsTitle: "Первый график уже сегодня",
    steps: [
      { title: "Создайте аккаунт", body: "Название заведения и email. Без карты." },
      { title: "Пригласите команду", body: "Вставьте команду из таблицы. Каждый заходит по ссылке и указывает доступность." },
      { title: "Опубликуйте график", body: "Сгенерируйте неделю, поправьте и отправьте команде." },
    ],
    pricingTitle: "Одна цена за всю команду",
    pricingBody: "Никогда не за человека. Одна небольшая точка бесплатно навсегда, в Pro входят до трёх точек. Каждый новый аккаунт начинает с 30 дней Pro.",
    pricingCta: { free: "Начать бесплатно", paid: "30 дней бесплатно" },
    mostPopular: "Чаще всего выбирают",
    compare: (percent) => `На ${percent}% дешевле 7shifts`,
    faqTitle: "Частые вопросы",
    faq: [
      {
        q: "Сколько это стоит?",
        a: "Free: одна точка и до 15 человек, без ограничения по времени. Starter — $26 в месяц за одну точку и до 30 человек. Pro — $58 в месяц до трёх точек без лимита людей, каждая следующая точка $15. При оплате за год два месяца бесплатно.",
      },
      { q: "Нужна ли карта, чтобы начать?", a: "Нет. 30 дней вы пользуетесь полным Pro, потом выбираете тариф или остаётесь на Free." },
      { q: "Нужно ли сотрудникам ставить приложение?", a: "Не из магазина. Сотрудник открывает ссылку из приглашения, задаёт пароль и может добавить Platofy на экран «Домой», чтобы получать уведомления." },
      {
        q: "Как учитываются переработки?",
        a: "Автографик не ставит человека больше 40 часов в неделю. При ручном назначении будет предупреждение, а в настройках можно разрешить автографику выходить за лимит.",
      },
      { q: "Может ли один человек работать на разных позициях?", a: "Да. Дайте ему несколько позиций, выберите основную и задайте ставку для каждой. Автографик использует любую из них." },
    ],
    finalTitle: "Составьте первый график уже сегодня",
    finalBody: "30 дней Pro бесплатно. Без карты и договора.",
    legal: { terms: "Условия", privacy: "Конфиденциальность", cookies: "Cookies" },
  },
};

const ROLE_COLORS = ["#b25000", "#1f5bd6", "#8e44ad", "#248a3d"];
const PREVIEW: Array<Array<{ name: string; time: string; role: number }>> = [
  [{ name: "Maria", time: "10–6", role: 3 }, { name: "Jake", time: "11–7", role: 0 }, { name: "Sara", time: "12–8", role: 1 }],
  [{ name: "Olga", time: "10–6", role: 0 }, { name: "Leo", time: "12–8", role: 1 }],
  [{ name: "Paul", time: "10–6", role: 3 }, { name: "Jake", time: "11–7", role: 0 }, { name: "Lena", time: "4–12", role: 2 }],
  [{ name: "Olga", time: "10–6", role: 0 }, { name: "Sara", time: "12–8", role: 1 }, { name: "Lena", time: "4–12", role: 2 }],
  [{ name: "Maria", time: "10–6", role: 3 }, { name: "Jake", time: "12–10", role: 0 }, { name: "Leo", time: "2–11", role: 1 }, { name: "Lena", time: "6–2", role: 2 }],
  [{ name: "Paul", time: "12–8", role: 3 }, { name: "Olga", time: "12–10", role: 0 }, { name: "Sara", time: "2–11", role: 1 }, { name: "Ana", time: "6–2", role: 2 }],
  [{ name: "Jake", time: "12–8", role: 0 }, { name: "Leo", time: "12–8", role: 1 }],
];

function currencyForLang(lang: Lang): Currency {
  return lang === "pl" ? "PLN" : "USD";
}

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

function SignupLink({ context, className, children, variant = "filled" }: { context: string; className?: string; children: ReactNode; variant?: "filled" | "gray" | "white" }) {
  return (
    <Link
      to={SIGNUP_URL}
      onClick={() => trackMarketingEvent("signup_cta_click", { context, page: window.location.pathname })}
      className={cn(
        "inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[12px] px-6 text-[17px] font-semibold transition active:opacity-70",
        variant === "filled" && "bg-[var(--color-primary-strong)] text-white hover:bg-[var(--color-primary-pressed)]",
        variant === "gray" && "bg-[var(--color-fill)] text-black hover:bg-[#d8d8de]",
        variant === "white" && "bg-white text-black hover:bg-[var(--color-grouped)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function WeekPreview({ copy }: { copy: Copy["preview"] }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--color-separator)] bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-separator)] px-4 py-3 sm:px-5">
        <p className="text-[15px] font-semibold text-black">{copy.title}</p>
        <span className="rounded-full bg-[var(--color-success-fill)] px-2.5 py-1 text-[12px] font-semibold text-[var(--color-success)]">{copy.published}</span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--color-separator)] sm:grid-cols-7">
        {PREVIEW.map((shifts, index) => (
          <div key={copy.days[index]} className={cn("min-w-0 p-2 sm:p-2.5", index >= 3 && "hidden sm:block")}>
            <p className="px-0.5 text-[12px] font-semibold uppercase text-[var(--color-text-muted)]">
              {copy.days[index]} <span className="text-black">{20 + index}</span>
            </p>
            <div className="mt-2 space-y-1.5">
              {shifts.map((shift) => (
                <div
                  key={`${index}-${shift.name}`}
                  className="rounded-[6px] px-2 py-1.5"
                  style={{ backgroundColor: `${ROLE_COLORS[shift.role]}14`, boxShadow: `inset 3px 0 0 ${ROLE_COLORS[shift.role]}` }}
                >
                  <p className="truncate text-[12px] font-semibold text-black">{shift.name}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{shift.time}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--color-separator)] bg-[var(--color-grouped)] px-4 py-3 text-[13px] sm:px-5">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {copy.roles.map((role, index) => (
            <span key={role} className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: ROLE_COLORS[index] }} />
              {role}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-semibold text-black">
          <span>{copy.laborCost}</span>
          <span>{copy.hours}</span>
          <span className="inline-flex items-center gap-1 text-[var(--color-success)]">
            <Check className="size-3.5" strokeWidth={3} /> {copy.rules}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { lang, setLang, t } = useLanguage();
  const copy = COPY[lang] ?? COPY.en;
  const currency = currencyForLang(lang);
  const fromPrice = formatMoney(PLAN_PRICE[currency].standard.monthly, currency, lang);

  return (
    <div className="min-h-dvh overflow-x-clip bg-white text-black">
      <header className="ios-bar sticky top-0 z-30 border-b border-[var(--color-separator)]">
        <Container className="flex h-14 items-center justify-between gap-3">
          <Link to="/" className="shrink-0" aria-label="Platofy">
            <BrandLogo kind="wordmark" className="text-[1.8rem]" />
          </Link>
          <nav aria-label={copy.nav.features} className="hidden md:block">
            <ul className="flex items-center gap-7">
              {[
                ["/how-it-works", copy.hero.secondary],
                ["#features", copy.nav.features],
                ["#pricing", copy.nav.pricing],
                ["#faq", copy.nav.faq],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="text-[15px] font-medium text-[var(--color-text-muted)] transition hover:text-black">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Segmented
              className="max-sm:hidden"
              ariaLabel={t("shell.language")}
              value={lang}
              onChange={setLang}
              options={[
                { value: "en", label: "EN" },
                { value: "pl", label: "PL" },
                { value: "ru", label: "RU" },
              ]}
            />
            <Link to={SIGNIN_URL} className="px-1 text-[15px] font-semibold text-[var(--color-primary-strong)]">
              {copy.nav.signIn}
            </Link>
            <SignupLink context="header" className="min-h-9 rounded-full px-4 text-[15px]">
              {copy.nav.start}
            </SignupLink>
          </div>
        </Container>
      </header>
      <div className="flex justify-center px-4 pt-3 empty:hidden">
        <DevLoginButton />
      </div>

      <main>
        <section className="pt-14 sm:pt-24">
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-black sm:text-[64px]">
                {copy.hero.title} <span className="whitespace-nowrap text-[var(--color-primary-strong)]">{copy.hero.highlight}</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-[19px] leading-8 text-[var(--color-text-muted)]">{copy.hero.body}</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <SignupLink context="hero" className="w-full sm:w-auto">
                  {copy.hero.primary} <ArrowRight className="size-5" />
                </SignupLink>
                <Link to="/how-it-works" className="inline-flex min-h-[50px] w-full items-center justify-center rounded-[12px] bg-[var(--color-fill)] px-6 text-[17px] font-semibold text-black sm:w-auto">
                  {copy.hero.secondary}
                </Link>
              </div>
              <p className="mt-5 text-[15px] text-[var(--color-text-muted)]">{copy.hero.note(fromPrice)}</p>
              <div className="mt-4 flex justify-center sm:hidden">
                <Segmented
                  ariaLabel={t("shell.language")}
                  value={lang}
                  onChange={setLang}
                  options={[
                    { value: "en", label: "English" },
                    { value: "pl", label: "Polski" },
                    { value: "ru", label: "Русский" },
                  ]}
                />
              </div>
            </div>
            <div className="mx-auto mt-12 max-w-5xl sm:mt-16">
              <WeekPreview copy={copy.preview} />
            </div>
          </Container>
        </section>

        <section id="features" className="scroll-mt-14 py-20 sm:py-28">
          <Container>
            <h2 className="mx-auto max-w-2xl text-center text-[32px] font-bold leading-tight tracking-[-0.02em] text-black sm:text-[40px]">{copy.featuresTitle}</h2>
            <div className="mt-12 grid border-y border-[var(--color-separator)] sm:grid-cols-2 lg:grid-cols-3 [&>*]:border-[var(--color-separator)] max-sm:divide-y max-sm:divide-[var(--color-separator)] sm:[&>*]:border-b">
              {copy.features.map((feature) => (
                <div key={feature.title} className="p-6 sm:p-7">
                  <span className="grid size-10 place-items-center rounded-[10px] bg-[var(--color-accent)] text-[var(--color-primary-strong)]">
                    <feature.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-[17px] font-semibold text-black">{feature.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-6 text-[var(--color-text-muted)]">{feature.body}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        <section className="border-y border-[var(--color-separator)] bg-[var(--color-grouped)] py-20 sm:py-24">
          <Container>
            <h2 className="text-center text-[32px] font-bold tracking-[-0.02em] text-black sm:text-[40px]">{copy.stepsTitle}</h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {copy.steps.map((step, index) => (
                <li key={step.title} className="text-center sm:text-left">
                  <span className="grid size-9 place-items-center rounded-full bg-black text-[15px] font-bold text-white max-sm:mx-auto">{index + 1}</span>
                  <h3 className="mt-3 text-[19px] font-semibold text-black">{step.title}</h3>
                  <p className="mt-1 text-[15px] leading-6 text-[var(--color-text-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        <section id="pricing" className="scroll-mt-14 py-20 sm:py-28">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-[32px] font-bold tracking-[-0.02em] text-black sm:text-[40px]">{copy.pricingTitle}</h2>
              <p className="mt-4 text-[17px] leading-7 text-[var(--color-text-muted)]">{copy.pricingBody}</p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl overflow-hidden rounded-[14px] border border-[var(--color-separator)] max-md:divide-y max-md:divide-[var(--color-separator)] md:grid-cols-3 md:divide-x md:divide-[var(--color-separator)]">
              {plans.map((plan) => {
                const featured = plan.key === "standard";
                const price = monthlyPrice(plan.key, currency);
                const saving = plan.key !== "free" && currency === "USD" ? Math.round((1 - price / SEVENSHIFTS_USD[plan.key]) * 100) : null;
                return (
                  <div key={plan.key} className={cn("flex flex-col p-6", featured && "bg-[var(--color-accent)]")}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[20px] font-bold text-black">{t(`plan.${plan.key}.title`)}</h3>
                      {featured ? <span className="rounded-full bg-[var(--color-primary-strong)] px-2.5 py-0.5 text-[12px] font-semibold text-white">{copy.mostPopular}</span> : null}
                    </div>
                    <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">{t(`plan.${plan.key}.tagline`)}</p>
                    <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-[40px] font-bold leading-none tracking-tight text-black">{formatMoney(price, currency, lang)}</span>
                      <span className="text-[14px] text-[var(--color-text-muted)]">{plan.key === "free" ? t("plan.forever") : t("plan.per_location_month")}</span>
                    </p>
                    {plan.key === "pro" ? (
                      <p className="mt-2 text-[14px] text-[var(--color-text-muted)]">
                        {t("plan.pro_extra", { price: formatMoney(PRO_EXTRA_LOCATION_PRICE[currency].monthly, currency, lang) })}
                      </p>
                    ) : null}
                    {saving ? <p className="mt-2 text-[14px] font-semibold text-[var(--color-success)]">{copy.compare(saving)}</p> : null}
                    <ul className="mt-6 flex-1 space-y-2.5">
                      {Array.from({ length: plan.features }, (_, index) => (
                        <li key={index} className="flex items-start gap-2.5 text-[15px] text-black">
                          <Check className="mt-0.5 size-[18px] shrink-0 text-[var(--color-success)]" strokeWidth={3} aria-hidden="true" />
                          {t(`plan.${plan.key}.f${index + 1}`)}
                        </li>
                      ))}
                    </ul>
                    <SignupLink context={`pricing-${plan.key}`} variant={featured ? "filled" : "gray"} className="mt-8 w-full">
                      {plan.key === "free" ? copy.pricingCta.free : copy.pricingCta.paid}
                    </SignupLink>
                  </div>
                );
              })}
            </div>
          </Container>
        </section>

        <section id="faq" className="scroll-mt-14 pb-20 sm:pb-28">
          <Container>
            <h2 className="text-center text-[32px] font-bold tracking-[-0.02em] text-black sm:text-[40px]">{copy.faqTitle}</h2>
            <div className="mx-auto mt-10 max-w-3xl divide-y divide-[var(--color-separator)] border-y border-[var(--color-separator)]">
              {copy.faq.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-[17px] font-semibold text-black [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown className="size-5 shrink-0 text-[#3c3c43] transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="pb-5 pr-8 text-[15px] leading-7 text-[var(--color-text-muted)]">{item.a}</p>
                </details>
              ))}
            </div>
          </Container>
        </section>

        <section className="bg-black py-20 text-center">
          <Container>
            <h2 className="text-[32px] font-bold tracking-[-0.02em] text-white sm:text-[40px]">{copy.finalTitle}</h2>
            <p className="mx-auto mt-3 max-w-md text-[17px] text-white/80">{copy.finalBody}</p>
            <SignupLink context="final-cta" variant="white" className="mt-8">
              {copy.hero.primary} <ArrowRight className="size-5" />
            </SignupLink>
          </Container>
        </section>
      </main>

      <footer className="border-t border-[var(--color-separator)] py-8">
        <Container className="flex flex-col gap-6 text-[14px] text-[var(--color-text-muted)] md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <BrandLogo kind="wordmark" className="text-[1.5rem]" />
            <a href="mailto:support@gastrostuff.pl" className="hover:text-black">
              support@gastrostuff.pl
            </a>
            <div className="flex items-center gap-3">
              <a href="https://www.instagram.com/gastrostuff.pl/" target="_blank" rel="noreferrer" aria-label="Instagram" className="hover:text-black">
                <Instagram className="size-5" />
              </a>
              <a href="https://www.facebook.com/profile.php?id=61590746600186" target="_blank" rel="noreferrer" aria-label="Facebook" className="hover:text-black">
                <Facebook className="size-5" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to={legalLinks(lang).terms} className="hover:text-black">
              {copy.legal.terms}
            </Link>
            <Link to={legalLinks(lang).privacy} className="hover:text-black">
              {copy.legal.privacy}
            </Link>
            <Link to={legalLinks(lang).cookies} className="hover:text-black">
              {copy.legal.cookies}
            </Link>
            <span>© 2026 Platofy</span>
          </div>
        </Container>
      </footer>
      <CookieConsent />
    </div>
  );
}
