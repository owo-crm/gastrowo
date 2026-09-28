import { useQuery } from "@tanstack/react-query";
import { Mailbox, Tag, TimerReset } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function WaitlistPage() {
  const { token } = useAuth();
  const waitlistQuery = useQuery({
    queryKey: ["marketing", "waitlist"],
    queryFn: () => api.listWaitlist(token!),
    enabled: Boolean(token),
  });

  const leads = waitlistQuery.data ?? [];

  return (
    <AppShell title="Waitlista" subtitle="Adresy email zostawione na landing page z oferty otwarcia.">
      <div className="space-y-5">
        <Card className="overflow-hidden border-0 p-0">
          <div className="grid gap-5 bg-white px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">Marketing</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-[var(--color-heading)] sm:text-3xl">
                Early-access waitlist dla Plato
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                Ta lista zbiera osoby, które zostawiły email po ofercie otwarcia: 1 miesiąc darmowego dostępu i 50% zniżki na pierwszy płatny miesiąc.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[12px] border border-[var(--color-border)] bg-white/90 px-4 py-4">
                <Mailbox className="size-4 text-[var(--color-primary-strong)]" />
                <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Leady</p>
                <p className="mt-1 text-2xl font-semibold tracking-[-0.01em] text-[var(--color-heading)]">{leads.length}</p>
              </div>
              <div className="rounded-[12px] border border-[var(--color-border)] bg-white/90 px-4 py-4">
                <Tag className="size-4 text-emerald-600" />
                <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Oferta</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">1 mies. free</p>
              </div>
              <div className="rounded-[12px] border border-[var(--color-border)] bg-white/90 px-4 py-4">
                <TimerReset className="size-4 text-blue-600" />
                <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Bonus</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">50% na 1. płatny mies.</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="rounded-[12px] border border-[var(--color-border)] bg-white p-0">
          <div className="border-b border-[var(--color-separator)] px-5 py-4">
            <p className="text-lg font-semibold tracking-[-0.01em] text-[var(--color-heading)]">Zebrane adresy</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Najnowsze zgłoszenia są pokazane na górze.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[var(--color-surface-muted)] text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Email</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Dodano</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-[var(--color-separator)]">
                    <td className="px-5 py-3 text-sm font-semibold text-[var(--color-heading)]">{lead.email}</td>
                    <td className="px-5 py-3 text-sm text-[var(--color-text-muted)]">{new Date(lead.created_at).toLocaleString("pl-PL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!leads.length ? <p className="px-5 py-6 text-sm text-[var(--color-text-muted)]">Brak zapisanych emaili.</p> : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
