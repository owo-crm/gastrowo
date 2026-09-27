import type { SubscriptionPlan } from "@/lib/types";

export type PlanDefinition = {
  key: SubscriptionPlan;
  title: string;
  price: string;
  cycle: string;
  highlights: string[];
};

export const plans: PlanDefinition[] = [
  {
    key: "free",
    title: "Free",
    price: "0 zł",
    cycle: "/ mies.",
    highlights: ["1 lokal", "do 5 aktywnych członków", "grafik i dostępność"],
  },
  {
    key: "pro",
    title: "Pro",
    price: "89 zł",
    cycle: "/ lokal / mies.",
    highlights: ["do 25 aktywnych członków", "raporty i prośby o zmiany", "powiadomienia i eksporty"],
  },
  {
    key: "business",
    title: "Business",
    price: "179 zł",
    cycle: "/ workspace / mies.",
    highlights: ["do 5 lokali", "uprawnienia i raporty zbiorcze", "zadania, notatki i inventory"],
  },
];
