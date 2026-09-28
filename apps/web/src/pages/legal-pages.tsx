import { Link } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const effectiveDate = "1 czerwca 2026";
const supportEmail = "support@gastrostuff.pl";
const siteUrl = "https://gastrostuff.pl";

function LegalLayout({
  title,
  subtitle,
  sections,
}: {
  title: string;
  subtitle: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-dvh bg-white text-[var(--color-text)]">
      <div className="mx-auto max-w-[920px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="shrink-0">
            <BrandLogo kind="wordmark" tone="light" className="text-[2.65rem] sm:text-[3.15rem]" />
          </Link>
          <Link to="/" className="text-sm font-semibold text-[var(--color-heading)] transition hover:text-[#2563eb]">
            Wróć na stronę główną
          </Link>
        </div>

        <article className="mt-6 rounded-[12px] border border-[rgba(148,163,184,0.16)] bg-white/98 p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">Dokumentacja serwisu</p>
          <h1 className="mt-3 text-[2.2rem] font-semibold tracking-[-0.01em] text-[var(--color-heading)] sm:text-[3rem]">{title}</h1>
          <p className="mt-3 max-w-[42rem] text-[15px] leading-7 text-[var(--color-text-muted)]">{subtitle}</p>
          <div className="mt-4 rounded-[12px] border border-[rgba(227,233,243,0.96)] bg-[rgba(248,251,255,0.92)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
            Data obowiązywania: <span className="font-semibold text-[var(--color-heading)]">{effectiveDate}</span>
          </div>

          <div className="mt-8 space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-[1.15rem] font-semibold tracking-[-0.01em] text-[var(--color-heading)] sm:text-[1.35rem]">{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-[15px] leading-7 text-[var(--color-text-muted)]">
                    {paragraph}
                  </p>
                ))}
                {section.bullets?.length ? (
                  <ul className="mt-4 space-y-2 text-[15px] leading-7 text-[var(--color-text-muted)]">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#2563eb]" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

const termsSections: LegalSection[] = [
  {
    title: "§1. Postanowienia ogólne",
    paragraphs: [
      `Niniejszy Regulamin określa zasady korzystania z platformy Plato dostępnej pod adresem ${siteUrl}.`,
      `Operatorem Serwisu jest Nikan Kozlov. W sprawach związanych z Serwisem można skontaktować się pod adresem ${supportEmail}.`,
    ],
  },
  {
    title: "§2. Definicje",
    bullets: [
      "Serwis – platforma Plato służąca do organizacji pracy restauracji i zespołu.",
      "Użytkownik – osoba korzystająca z Serwisu.",
      "Administrator – właściciel organizacji lub restauracji korzystającej z Serwisu.",
      "Organizacja – restauracja, lokal gastronomiczny lub inny podmiot korzystający z Serwisu.",
      "Konto – indywidualne konto Użytkownika w Serwisie.",
    ],
  },
  {
    title: "§3. Zakres usług",
    paragraphs: [
      "Plato umożliwia w szczególności planowanie grafików, zarządzanie zespołem, zadaniami, notatkami oraz wybranymi danymi operacyjnymi restauracji.",
    ],
    bullets: [
      "tworzenie i publikowanie grafików pracy,",
      "zarządzanie organizacją i personelem,",
      "obsługę próśb zespołu i komunikacji wewnętrznej,",
      "wprowadzanie danych operacyjnych i generowanie raportów,",
      "przesyłanie zdjęć, plików i dokumentów związanych z działalnością organizacji.",
    ],
  },
  {
    title: "§4. Konto i dostęp do Serwisu",
    paragraphs: [
      "Korzystanie z wybranych funkcji Serwisu wymaga założenia konta lub otrzymania dostępu od Administratora Organizacji.",
      "Użytkownik odpowiada za prawdziwość danych podanych przy rejestracji oraz za bezpieczeństwo danych dostępowych.",
    ],
  },
  {
    title: "§5. Obowiązki Użytkownika",
    bullets: [
      "korzystanie z Serwisu zgodnie z prawem i niniejszym Regulaminem,",
      "niedostarczanie treści bezprawnych, obraźliwych lub naruszających prawa osób trzecich,",
      "niewykorzystywanie Serwisu do działań zakłócających jego bezpieczeństwo lub stabilność,",
      "ochrona danych logowania i nieudostępnianie konta osobom nieuprawnionym.",
    ],
  },
  {
    title: "§6. Dane Organizacji",
    paragraphs: [
      "Administrator Organizacji odpowiada za zakres danych wprowadzanych do Serwisu oraz za prawidłowość podstaw prawnych do ich przetwarzania w ramach działalności Organizacji.",
    ],
  },
  {
    title: "§7. Odpowiedzialność",
    paragraphs: [
      "Operator dokłada należytej staranności, aby Serwis działał w sposób ciągły i bezpieczny, jednak nie gwarantuje nieprzerwanej dostępności wszystkich funkcji w każdej chwili.",
      "Operator nie odpowiada za skutki nieprawidłowego wykorzystania Serwisu przez Użytkownika ani za dane wprowadzone przez Organizację.",
    ],
  },
  {
    title: "§8. Własność intelektualna",
    paragraphs: [
      "Wszelkie prawa do Serwisu, jego kodu źródłowego, elementów graficznych, materiałów i treści należą do Operatora lub podmiotów współpracujących.",
    ],
  },
  {
    title: "§9. Zakończenie korzystania",
    paragraphs: [
      "Operator może ograniczyć lub zakończyć dostęp do Serwisu w przypadku naruszenia Regulaminu, przepisów prawa albo zagrożenia bezpieczeństwa platformy.",
    ],
  },
  {
    title: "§10. Postanowienia końcowe",
    paragraphs: [
      "Regulamin może być aktualizowany wraz z rozwojem Serwisu lub zmianami prawnymi. Aktualna wersja jest zawsze dostępna na tej stronie.",
      `W sprawach dotyczących Regulaminu kontakt odbywa się przez ${supportEmail}.`,
    ],
  },
];

const privacySections: LegalSection[] = [
  {
    title: "1. Informacje ogólne",
    paragraphs: [
      `Niniejsza Polityka Prywatności opisuje zasady przetwarzania danych osobowych użytkowników platformy Plato dostępnej pod adresem ${siteUrl}.`,
      `Administratorem danych jest Nikan Kozlov. Kontakt w sprawach ochrony danych: ${supportEmail}.`,
    ],
  },
  {
    title: "2. Jakie dane przetwarzamy",
    bullets: [
      "dane identyfikacyjne i kontaktowe, w tym imię, nazwisko i adres e-mail,",
      "dane konta i organizacji, role użytkowników oraz ustawienia zespołu,",
      "dane operacyjne wprowadzane do Serwisu, takie jak grafiki, zadania, notatki i raporty,",
      "dane techniczne związane z korzystaniem z Serwisu, w tym logi bezpieczeństwa i podstawowe informacje o urządzeniu.",
    ],
  },
  {
    title: "3. Cele przetwarzania danych",
    bullets: [
      "utworzenie i obsługa konta użytkownika,",
      "świadczenie usług dostępnych w Plato,",
      "zarządzanie organizacją, zespołem i komunikacją wewnętrzną,",
      "zapewnienie bezpieczeństwa, wykrywanie nadużyć i utrzymanie działania Serwisu,",
      "kontakt z użytkownikami w sprawach organizacyjnych, technicznych i handlowych,",
      "realizacja płatności i rozliczeń, jeśli zostaną wdrożone płatne plany.",
    ],
  },
  {
    title: "4. Podstawa prawna przetwarzania",
    paragraphs: [
      "Dane przetwarzamy zgodnie z RODO, w szczególności na podstawie niezbędności do wykonania umowy, obowiązków prawnych, uzasadnionego interesu Administratora oraz zgody, gdy jest wymagana.",
    ],
  },
  {
    title: "5. Odbiorcy danych",
    paragraphs: [
      "Dane mogą być powierzane podmiotom wspierającym działanie Serwisu, w szczególności dostawcom hostingu, infrastruktury technicznej, zabezpieczeń oraz narzędzi wspierających komunikację i utrzymanie platformy.",
    ],
  },
  {
    title: "6. Przechowywanie danych",
    paragraphs: [
      "Dane przechowujemy przez okres niezbędny do świadczenia usług, utrzymania konta, realizacji obowiązków prawnych oraz ochrony uzasadnionych interesów Administratora.",
    ],
  },
  {
    title: "7. Bezpieczeństwo danych",
    bullets: [
      "ochrona przed nieuprawnionym dostępem,",
      "ochrona przed utratą, zniszczeniem lub modyfikacją danych,",
      "stosowanie odpowiednich środków organizacyjnych i technicznych,",
      "szyfrowanie połączeń z Serwisem z użyciem SSL/TLS.",
    ],
  },
  {
    title: "8. Prawa użytkownika",
    bullets: [
      "prawo dostępu do danych,",
      "prawo sprostowania danych,",
      "prawo usunięcia danych,",
      "prawo ograniczenia przetwarzania,",
      "prawo wniesienia sprzeciwu,",
      "prawo przenoszenia danych,",
      "prawo wniesienia skargi do organu nadzorczego.",
    ],
  },
  {
    title: "9. Cookies",
    paragraphs: [
      "Serwis wykorzystuje pliki cookies niezbędne do prawidłowego działania platformy. Szczegóły opisuje osobna Polityka Cookies.",
    ],
  },
  {
    title: "10. Przekazywanie danych poza EOG",
    paragraphs: [
      "Jeżeli korzystamy z dostawców działających poza Europejskim Obszarem Gospodarczym, dane są przekazywane zgodnie z mechanizmami przewidzianymi przez RODO, w szczególności na podstawie standardowych klauzul umownych.",
    ],
  },
  {
    title: "11. Kontakt",
    paragraphs: [
      `W sprawach związanych z ochroną danych osobowych można kontaktować się pod adresem ${supportEmail}.`,
    ],
  },
  {
    title: "12. Zmiany Polityki Prywatności",
    paragraphs: [
      "Polityka Prywatności może być aktualizowana wraz z rozwojem Serwisu, zmianami technologicznymi lub zmianami przepisów prawa. Aktualna wersja jest zawsze dostępna na tej stronie.",
    ],
  },
];

const cookiesSections: LegalSection[] = [
  {
    title: "1. Informacje ogólne",
    paragraphs: [
      `Niniejsza Polityka Cookies określa zasady wykorzystywania plików cookies przez platformę Plato dostępną pod adresem ${siteUrl}.`,
      `Administratorem Serwisu jest Nikan Kozlov. Kontakt: ${supportEmail}.`,
    ],
  },
  {
    title: "2. Czym są pliki cookies",
    paragraphs: [
      "Cookies to niewielkie pliki tekstowe przechowywane na urządzeniu użytkownika podczas korzystania z Serwisu. Pomagają one w prawidłowym działaniu platformy i zwiększają bezpieczeństwo korzystania z usług.",
    ],
  },
  {
    title: "3. Jakie cookies wykorzystujemy",
    bullets: [
      "cookies niezbędne do utrzymania sesji użytkownika,",
      "cookies potrzebne do uwierzytelniania i bezpieczeństwa logowania,",
      "cookies wspierające ochronę przed nadużyciami i zapamiętywanie podstawowych ustawień.",
    ],
  },
  {
    title: "4. Cookies podmiotów trzecich",
    paragraphs: [
      "Serwis może korzystać z usług zewnętrznych dostawców infrastruktury technicznej i bezpieczeństwa, w tym rozwiązań wspierających ochronę przed atakami sieciowymi, dostarczanie treści i bezpieczeństwo połączeń.",
    ],
  },
  {
    title: "5. Zarządzanie cookies",
    paragraphs: [
      "Użytkownik może w każdej chwili zmienić ustawienia dotyczące plików cookies w swojej przeglądarce internetowej. Ograniczenie stosowania cookies może wpłynąć na funkcjonalność Serwisu.",
    ],
  },
  {
    title: "6. Zmiany Polityki Cookies",
    paragraphs: [
      "Polityka Cookies może być aktualizowana wraz z rozwojem Serwisu lub zmianami przepisów prawa. Aktualna wersja jest zawsze dostępna na tej stronie.",
    ],
  },
  {
    title: "7. Kontakt",
    paragraphs: [
      `W sprawach dotyczących plików cookies można kontaktować się pod adresem ${supportEmail}.`,
    ],
  },
];

export function TermsPage() {
  return <LegalLayout title="Regulamin Serwisu Plato" subtitle="Zasady korzystania z platformy Plato dla restauracji i zespołów." sections={termsSections} />;
}

export function PrivacyPolicyPage() {
  return <LegalLayout title="Polityka Prywatności Plato" subtitle="Zasady przetwarzania danych osobowych użytkowników i organizacji korzystających z Plato." sections={privacySections} />;
}

export function CookiesPolicyPage() {
  return <LegalLayout title="Polityka Cookies Plato" subtitle="Informacje o wykorzystywaniu plików cookies i ustawieniach związanych z bezpieczeństwem oraz działaniem serwisu." sections={cookiesSections} />;
}
