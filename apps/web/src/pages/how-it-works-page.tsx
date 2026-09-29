import { useEffect, type ReactNode } from "react";
import { ArrowRight, Check, Lightbulb } from "lucide-react";
import { Link } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";
import { Segmented } from "@/components/ui/segmented";
import { type Lang, useLanguage } from "@/lib/i18n";
import { legalLinks } from "@/lib/legal-links";
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

const PL: Copy = {
  meta: {
    title: "Jak działa Platofy — grafik, rejestracja czasu i wypłaty dla restauracji",
    description:
      "Zobacz prawdziwą aplikację Platofy krok po kroku: dostępność zespołu, grafik w kilka minut, odbicia z telefonu lub tabletu, zatwierdzanie tylko wyjątków i eksport wypłat.",
  },
  nav: { home: "Strona główna", pricing: "Cennik", signIn: "Zaloguj", start: "Zacznij za darmo" },
  hero: {
    eyebrow: "Jak to działa",
    title: "Od dostępności do wypłat — w jednym obiegu",
    body: "To prawdziwa aplikacja, nie makieta. Tak wygląda tydzień właściciela, managera i zespołu — i dlaczego każdy krok oszczędza czas albo pieniądze.",
  },
  loop: ["Start", "Dostępność", "Grafik", "Telefony zespołu", "Odbicia", "Godziny", "Koszty i wypłaty"],
  whyLabel: "Dlaczego to ważne",
  steps: [
    {
      title: "Konfiguracja za jednym posiedzeniem",
      body: "Dodaj stanowiska i stawki, potem wklej zespół z arkusza. Każdy dostaje zaproszenie e-mailem, ustawia hasło i trafia do Twojej restauracji z właściwym stanowiskiem i stawką.",
      points: ["Jedna osoba może mieć kilka stanowisk, każde z własną stawką", "Import z Excela lub Arkuszy Google — dowolna kolejność kolumn", "Za darmo dla jednego lokalu i do 15 osób"],
      why: "Większość aplikacji do grafików porzuca się już przy konfiguracji. Tu cały zespół jest w środku, zanim wystygnie kawa.",
      shots: [shot("desk-positions", "desktop", "Stanowiska i stawki"), shot("desk-import", "desktop", "Import zespołu z arkusza")],
    },
    {
      title: "Zespół podaje, kiedy może pracować",
      body: "Każdy zaznacza w telefonie dni i godziny na dany tydzień. Widzisz cały zespół naraz — zielony dzień to dzień wolny do pracy — i zatwierdzasz jednym dotknięciem.",
      points: ["Dni wolne są respektowane automatycznie", "Chciana liczba godzin tygodniowo", "Koniec gonienia ludzi na czatach"],
      why: "Znikają wiadomości „możesz w piątek?”. Grafik startuje od prawdziwej dostępności, więc mniej zmian jest potem zamienianych.",
      shots: [shot("phone-availability", "phone", "Dostępność pracownika w telefonie"), shot("desk-availability", "desktop", "Dostępność zespołu na tydzień")],
    },
    {
      title: "Tydzień układa się sam — Ty tylko poprawiasz",
      body: "Platofy obsadza zmiany na podstawie dostępności, stanowisk i priorytetów, pilnując przepisów o odpoczynku. Szkic jest niewidoczny dla zespołu do publikacji. Stuknij zmianę, by zobaczyć, kto jest wolny, kto ma konflikt, a kto nie pracuje na tym stanowisku.",
      points: ["Obsada, wolne zmiany i koszt pracy aktualizują się na bieżąco", "Twój wybór zawsze wygrywa — nawet w dzień wolny", "Zmiany nocne i kilka lokali"],
      why: "Właściciele mówią, że grafik zajmuje im 2–3 godziny tygodniowo. Tu to ok. 15 minut, a nadgodziny widać, zanim zaczną kosztować.",
      shots: [shot("desk-draft", "desktop", "Szkic tygodnia z obsadzonymi i wolnymi zmianami"), shot("desk-shift-editor", "desktop", "Wybór osoby na zmianę")],
    },
    {
      title: "Każdy ma grafik w telefonie",
      body: "Po publikacji zespół dostaje powiadomienie. Każdy widzi swój tydzień, z kim pracuje, i może poprosić o zamianę lub przejęcie zmiany. Ty akceptujesz jednym dotknięciem.",
      points: ["Instalacja na ekranie początkowym — bez sklepu", "Powiadomienia o grafiku, zamianach i zadaniach", "Zadania ze zdjęciem jako dowodem"],
      why: "Koniec zrzutów ekranu z arkusza na czacie i „nie wiedziałem, że pracuję”. Zamiany zostają w systemie, więc grafik jest zawsze aktualny.",
      shots: [shot("phone-my-week", "phone", "Tydzień pracownika w telefonie"), shot("phone-requests", "phone", "Akceptacja zamiany i przejęcia")],
    },
    {
      title: "Odbicia z telefonu lub tabletu",
      body: "Pracownik naciska „Zacznij zmianę” w telefonie albo wpisuje 4-cyfrowy PIN na tablecie przy wejściu. Przerwa to też jedno dotknięcie. Możesz wymagać, by odbicia z telefonu były w restauracji.",
      points: ["Telefon, tablet albo oba", "Przerwy odejmowane od płatnych godzin", "Punktualne odbicia zatwierdzają się same"],
      why: "Godziny pochodzą z prawdziwych odbić, a nie z pamięci na koniec tygodnia. Mniej sporów, uczciwsze wypłaty i ewidencja, której można ufać.",
      shots: [shot("phone-on-the-clock", "phone", "W pracy, z przyciskiem przerwy"), shot("tablet-kiosk", "tablet", "Klawiatura PIN na tablecie")],
    },
    {
      title: "Zatwierdzasz tylko wyjątki",
      body: "Wszystko, co zgadza się z grafikiem, jest już zatwierdzone. Reszta — ktoś został dłużej, przyszedł bez zmiany — czeka w Godzinach, pogrupowana po dniach.",
      points: ["Poprawka godzin jednym dotknięciem", "„Zatwierdź wszystkie”, gdy wszystko się zgadza", "Każda zmiana zapisana z autorem"],
      why: "Poniedziałkowe sprawdzanie godzin skraca się z godziny do kilku minut, a nic nie trafia do wypłat bez wiedzy managera.",
      shots: [shot("phone-hours", "phone", "Godziny do zatwierdzenia"), shot("desk-hours", "desktop", "Godziny po dniach na komputerze")],
    },
    {
      title: "Koszt pracy i wypłaty",
      body: "Wpisz utarg dnia i zobacz koszt pracy jako procent przychodu — dziennie i dla każdego lokalu. Eksport CSV dla księgowej. Każdy pracownik widzi swoje godziny i wypłatę.",
      points: ["Koszt pracy względem celu 30%", "Stawki za stanowiska liczone automatycznie", "CSV w formacie polskim lub amerykańskim"],
      why: "Praca to największy koszt, na który masz wpływ. Widząc go codziennie — a nie na koniec miesiąca — łatwiej utrzymać go poniżej 30%.",
      shots: [shot("desk-overview", "desktop", "Utarg, koszt pracy i procent"), shot("desk-payroll", "desktop", "Wypłaty"), shot("phone-pay", "phone", "Wypłata pracownika")],
    },
  ],
  final: {
    title: "Wypróbuj z własnym zespołem w tym tygodniu",
    body: "Za darmo dla jednego lokalu i do 15 osób. Płatne plany od 99 zł miesięcznie, a Pro obejmuje do trzech lokali — nigdy za osobę.",
    cta: "Zacznij za darmo",
    note: "30 dni Pro gratis · bez karty",
  },
  legal: { terms: "Regulamin", privacy: "Prywatność", cookies: "Cookies" },
};

const RU: Copy = {
  meta: {
    title: "Как работает Platofy — график, учёт времени и зарплата для ресторанов",
    description:
      "Настоящее приложение Platofy по шагам: доступность команды, график за минуты, отметки с телефона или планшета, подтверждение только исключений и выгрузка зарплаты.",
  },
  nav: { home: "Главная", pricing: "Цены", signIn: "Войти", start: "Начать бесплатно" },
  hero: {
    eyebrow: "Как это работает",
    title: "От доступности до зарплаты — один цикл",
    body: "Это настоящее приложение, а не макет. Так выглядит неделя владельца, менеджера и команды — и почему каждый шаг экономит время или деньги.",
  },
  loop: ["Настройка", "Доступность", "График", "Телефоны команды", "Отметки", "Часы", "Затраты и зарплата"],
  whyLabel: "Почему это важно",
  steps: [
    {
      title: "Настройка за один присест",
      body: "Добавьте позиции и ставки, вставьте команду из таблицы. Каждый получает приглашение, задаёт пароль и попадает в ваш ресторан с нужной позицией и ставкой.",
      points: ["У одного человека может быть несколько позиций со своими ставками", "Импорт из Excel или Google Таблиц — колонки в любом порядке", "Бесплатно для одной точки и до 15 человек"],
      why: "Большинство сервисов бросают ещё на настройке. Здесь вся команда внутри быстрее, чем остынет кофе.",
      shots: [shot("desk-positions", "desktop", "Позиции и ставки"), shot("desk-import", "desktop", "Импорт команды из таблицы")],
    },
    {
      title: "Команда сама говорит, когда может работать",
      body: "Каждый отмечает в телефоне дни и часы на неделю. Вы видите всю команду сразу — зелёный день значит свободен — и подтверждаете одним нажатием.",
      points: ["Выходные учитываются автоматически", "Желаемые часы в неделю у каждого", "Никаких переписок в чатах"],
      why: "Исчезают сообщения «сможешь в пятницу?». График строится от реальной доступности, поэтому потом меньше обменов и срывов.",
      shots: [shot("phone-availability", "phone", "Доступность сотрудника в телефоне"), shot("desk-availability", "desktop", "Доступность команды на неделю")],
    },
    {
      title: "Неделя строится сама — вы только правите",
      body: "Platofy заполняет смены по доступности, позициям и приоритетам и держит каждого в пределах 40 часов. Черновик не видно команде до публикации. Нажмите на смену — видно, кто свободен, у кого конфликт и кто не работает на этой позиции.",
      points: ["Заполненность, открытые смены и затраты обновляются на ходу", "Ваш выбор всегда побеждает — даже в выходной", "Ночные смены и несколько точек"],
      why: "Владельцы тратят на график 2–3 часа в неделю. Здесь около 15 минут, а переработки видны ещё до публикации.",
      shots: [shot("desk-draft", "desktop", "Черновик недели"), shot("desk-shift-editor", "desktop", "Выбор человека на смену")],
    },
    {
      title: "У каждого график в телефоне",
      body: "После публикации команда получает пуш. Каждый видит свою неделю, с кем работает, и может попросить обмен или взять смену. Вы подтверждаете одним нажатием.",
      points: ["Ставится на экран «Домой» — без магазина приложений", "Пуши о графике, обменах и задачах", "Задачи с фото-подтверждением"],
      why: "Больше никаких скриншотов таблицы в чате и «я не знал, что работаю». Обмены остаются в системе, график всегда актуальный.",
      shots: [shot("phone-my-week", "phone", "Неделя сотрудника"), shot("phone-requests", "phone", "Одобрение обмена и взятия смены")],
    },
    {
      title: "Отметка с телефона или планшета",
      body: "Сотрудник жмёт «Начать смену» в телефоне или вводит 4-значный PIN на планшете у входа. Перерыв — тоже одно нажатие. Можно требовать, чтобы с телефона отмечались только в ресторане.",
      points: ["Телефон, планшет или оба", "Перерывы вычитаются из оплачиваемых часов", "Отметки по графику подтверждаются сами"],
      why: "Часы берутся из реальных отметок, а не из памяти в конце недели. Меньше споров, честнее зарплата, учёту можно доверять.",
      shots: [shot("phone-on-the-clock", "phone", "На смене, с кнопкой перерыва"), shot("tablet-kiosk", "tablet", "PIN-клавиатура на планшете")],
    },
    {
      title: "Подтверждаете только исключения",
      body: "Всё, что совпало с графиком, уже подтверждено. Остальное — кто-то задержался или пришёл без смены — ждёт в «Часах», по дням, с кнопками прямо в строке.",
      points: ["Правка времени в одно нажатие", "«Подтвердить все», когда всё сходится", "Каждое изменение сохраняется с автором"],
      why: "Проверка часов в понедельник сокращается с часа до пары минут, и ничего не попадает в зарплату без ведома менеджера.",
      shots: [shot("phone-hours", "phone", "Часы на подтверждение"), shot("desk-hours", "desktop", "Часы по дням")],
    },
    {
      title: "Затраты на персонал и зарплата",
      body: "Внесите выручку за день и смотрите долю зарплаты в выручке — по дням и точкам. Зарплата считается по подтверждённым часам и выгружается в CSV. Каждый сотрудник видит свои часы и заработок.",
      points: ["Доля зарплаты против цели 30%", "Переработки и ставки позиций считаются сами", "CSV в американском или польском формате"],
      why: "Персонал — самая большая статья расходов, которой вы управляете. Видеть её каждый день, а не в конце месяца, — так рестораны держат её ниже 30%.",
      shots: [shot("desk-overview", "desktop", "Выручка, затраты и доля"), shot("desk-payroll", "desktop", "Зарплата"), shot("phone-pay", "phone", "Заработок сотрудника")],
    },
  ],
  final: {
    title: "Попробуйте со своей командой на этой неделе",
    body: "Бесплатно для одной точки и до 15 человек. Платные планы от $26 в месяц, а Pro покрывает до трёх точек — никогда не за человека.",
    cta: "Начать бесплатно",
    note: "30 дней Pro бесплатно · без карты",
  },
  legal: { terms: "Условия", privacy: "Конфиденциальность", cookies: "Cookies" },
};

const COPY: Record<Lang, Copy> = { en: EN, pl: PL, ru: RU } as Record<Lang, Copy>;

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
  const { lang, setLang } = useLanguage();
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
      <header className="ios-bar sticky top-0 z-30 border-b border-[var(--color-separator)]">
        <Container className="flex h-14 items-center justify-between gap-3">
          <Link to="/" aria-label="Platofy">
            <BrandLogo kind="wordmark" className="text-[1.8rem]" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Segmented
              className="max-sm:hidden"
              ariaLabel="Language"
              value={lang}
              onChange={setLang}
              options={[
                { value: "en", label: "EN" },
                { value: "pl", label: "PL" },
                { value: "ru", label: "RU" },
              ]}
            />
            <Link to="/login?mode=signin" className="px-1 text-[15px] font-semibold text-[var(--color-primary-strong)]">
              {copy.nav.signIn}
            </Link>
            <Link to="/login?mode=onboarding" className="inline-flex min-h-9 items-center rounded-full bg-[var(--color-primary-strong)] px-4 text-[15px] font-semibold text-white">
              {copy.nav.start}
            </Link>
          </div>
        </Container>
      </header>

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
