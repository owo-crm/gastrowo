import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

/** Platofy-internal: emails left on the landing page, newest first. */
export function WaitlistPage() {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const waitlistQuery = useQuery({ queryKey: ["marketing", "waitlist"], queryFn: () => api.listWaitlist(token!), enabled: Boolean(token) });
  const leads = waitlistQuery.data ?? [];

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(leads.map((lead) => lead.email).join("\n"));
      toast.success(t("waitlist.copied", { count: leads.length }));
    } catch {
      toast.error(t("waitlist.copy_failed"));
    }
  };

  return (
    <AppShell
      title={t("sub.waitlist")}
      flush
      action={
        leads.length ? (
          <Button size="sm" variant="tinted" onClick={copyAll}>
            <Copy className="size-4" /> {t("waitlist.copy_all")}
          </Button>
        ) : undefined
      }
    >
      <ListSection header={t("waitlist.count", { count: leads.length })} footer={t("waitlist.footer")}>
        {leads.map((lead) => (
          <ListRow key={lead.id} title={lead.email} trailing={formatDate(lead.created_at, lang, { year: "numeric", month: "short", day: "numeric" })} />
        ))}
        {!leads.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("waitlist.empty")}</span>} /> : null}
      </ListSection>
    </AppShell>
  );
}
