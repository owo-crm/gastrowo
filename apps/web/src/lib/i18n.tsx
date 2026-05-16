import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Lang = "en" | "pl";

type Dict = Record<string, string>;

const dicts: Record<Lang, Dict> = {
  en: {
    overview: "Overview",
    schedule: "Schedule",
    tasks: "Tasks",
    team: "Team",
    profile: "Profile",
    reports: "Reports",
    login: "Login",
    logout: "Logout",
    generate: "Generate schedule",
    save: "Save",
  },
  pl: {
    overview: "Przegląd",
    schedule: "Grafik",
    tasks: "Zadania",
    team: "Zespół",
    profile: "Profil",
    reports: "Raporty",
    login: "Zaloguj",
    logout: "Wyloguj",
    generate: "Generuj grafik",
    save: "Zapisz",
  },
};

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("gastrowo.lang") ?? localStorage.getItem("workdish.lang");
    return saved === "pl" ? "pl" : "en";
  });

  const setLang = (nextLang: Lang) => {
    localStorage.setItem("gastrowo.lang", nextLang);
    localStorage.removeItem("workdish.lang");
    setLangState(nextLang);
  };

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      t: (key: string) => dicts[lang][key] ?? key,
    }),
    [lang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
