import { AlertTriangle, Boxes, CalendarClock, Search, Wrench } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n";

const previewRows = [
  { name: "Rational iCombi Pro", code: "EQ-OV-0041", status: "In use", category: "Kitchen", location: "Old Town Kitchen", condition: "91%", next: "May 05" },
  { name: "Coldline Fridge 900L", code: "EQ-FR-0003", status: "Maintenance", category: "Storage", location: "Cold Room A", condition: "61%", next: "Apr 22" },
  { name: "Hobart Dishwasher", code: "EQ-DW-0111", status: "Critical fault", category: "Kitchen", location: "Dish Area", condition: "18%", next: "Overdue" },
];

export function InventoryPage() {
   const { t } = useLanguage();
   return (
     <AppShell title={t("inventory.title")} subtitle={t("inventory.subtitle")} action={<Badge className="border-slate-300 bg-slate-100 text-slate-700">{t("common.preview")}</Badge>}>
      <div className="animate-slide-in relative overflow-hidden rounded-[2rem]" style={{ animationDelay: "100ms" }}>
        <div className="space-y-5 opacity-45">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Total units", value: "142", icon: Boxes, tone: "text-[var(--color-heading)]" },
              { label: "Available", value: "89", icon: Boxes, tone: "text-emerald-600" },
              { label: "In use", value: "34", icon: CalendarClock, tone: "text-blue-700" },
              { label: "Maintenance", value: "12", icon: Wrench, tone: "text-amber-600" },
              { label: "Critical / fault", value: "7", icon: AlertTriangle, tone: "text-red-600" },
            ].map((stat) => (
              <Card key={stat.label} className="min-h-[132px] p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{stat.label}</p>
                  <stat.icon className="size-5 text-slate-300" />
                </div>
                <p className={`mt-8 text-[2.75rem] font-bold leading-none tracking-[-0.06em] ${stat.tone}`}>{stat.value}</p>
              </Card>
            ))}
          </section>

          <Card className="p-0">
            <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-[-0.04em] text-[var(--color-heading)]">Equipment inventory</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Search, service dates, condition, and readiness in one table.</p>
              </div>
              <div className="flex min-h-11 w-full items-center gap-2 rounded-[1rem] border border-[var(--color-border)] bg-white px-3 md:max-w-[360px]">
                <Search className="size-4 text-[var(--color-text-muted)]" />
                <span className="text-sm text-[var(--color-text-muted)]">Search equipment...</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[920px]">
                <div className="grid grid-cols-[1.4fr_0.9fr_1fr_1.1fr_0.8fr_0.8fr] border-y border-[var(--color-divider)] bg-slate-50/70 px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  <span>Equipment</span>
                  <span>Status</span>
                  <span>Category</span>
                  <span>Location</span>
                  <span>Condition</span>
                  <span>Next service</span>
                </div>
                {previewRows.map((row) => (
                  <div key={row.code} className="grid grid-cols-[1.4fr_0.9fr_1fr_1.1fr_0.8fr_0.8fr] items-center border-b border-[var(--color-divider)] px-5 py-4 text-sm">
                    <div>
                      <p className="font-semibold text-[var(--color-heading)]">{row.name}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{row.code}</p>
                    </div>
                    <p className="text-[var(--color-text-muted)]">{row.status}</p>
                    <p className="text-[var(--color-text-muted)]">{row.category}</p>
                    <p className="text-[var(--color-text-muted)]">{row.location}</p>
                    <p className="text-[var(--color-text-muted)]">{row.condition}</p>
                    <p className={row.next === "Overdue" ? "font-semibold text-red-600" : "text-[var(--color-text-muted)]"}>{row.next}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="absolute inset-0 grid place-items-center rounded-[2rem] bg-slate-950/56 backdrop-blur-[2px]">
          <div className="max-w-xl px-6 text-center text-white">
            <Badge className="border-white/18 bg-white/12 text-white">Preview only</Badge>
            <h2 className="mt-5 text-4xl font-bold tracking-[-0.05em]">In development</h2>
            <p className="mt-3 text-sm leading-6 text-white/72">
              Inventory is visible as a product preview only. Search, item lifecycle, and service actions will be unlocked in a later iteration.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
