import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Gift, Share2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

/** Settings → Invite a restaurant: the business's referral link and what it has earned. */
export function ReferralsPage() {
  const { token } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const query = useQuery({ queryKey: ["referrals"], queryFn: () => api.referrals(token!), enabled: Boolean(token) });
  const data = query.data;
  const link = data ? `${window.location.origin}${data.path}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("referral.copied"));
    } catch {
      toast.error(t("referral.copy_failed"), link);
    }
  };
  const share = async () => {
    const text = t("referral.share_text");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Platofy", text, url: link });
        return;
      } catch {
        // Cancelled: fall back to copying.
      }
    }
    await copy();
  };

  return (
    <AppShell title={t("referral.title")} subtitle={t("referral.subtitle")} flush>
      <div className="mx-4 mb-4 rounded-[24px] bg-[radial-gradient(700px_400px_at_10%_0%,#3b7bff,#1f5bd6_60%,#1646a8)] p-6 text-white sm:mx-6">
        <Gift className="size-8" />
        <p className="mt-3 text-[22px] font-bold leading-7 text-white">{t("referral.hero_title")}</p>
        <p className="mt-2 text-[15px] leading-6 text-white/85">{t("referral.hero_body")}</p>
        <div className="mt-5 flex items-center gap-2 rounded-[14px] bg-white/15 p-2 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-[15px]" data-testid="referral-link">{link || "…"}</span>
          <Button size="sm" variant="inverse" onClick={copy} disabled={!link}>
            <Copy className="size-4" /> {t("referral.copy")}
          </Button>
        </div>
        <Button className="mt-3 w-full bg-white text-black hover:bg-white/90 sm:w-auto" onClick={share} disabled={!link}>
          <Share2 className="size-4" /> {t("referral.share")}
        </Button>
      </div>

      <ListSection header={t("referral.how")}>
        <ListRow title={t("referral.step1")} leading={<span className="grid size-7 place-items-center rounded-full bg-[var(--color-accent)] text-[14px] font-bold text-[var(--color-primary-strong)]">1</span>} />
        <ListRow title={t("referral.step2")} leading={<span className="grid size-7 place-items-center rounded-full bg-[var(--color-accent)] text-[14px] font-bold text-[var(--color-primary-strong)]">2</span>} />
        <ListRow title={t("referral.step3")} leading={<span className="grid size-7 place-items-center rounded-full bg-[var(--color-accent)] text-[14px] font-bold text-[var(--color-primary-strong)]">3</span>} />
      </ListSection>

      <ListSection header={t("referral.results")} footer={data?.free_months_waiting ? t("referral.credit_footer", { count: data.free_months_waiting }) : undefined}>
        <ListRow title={t("referral.joined")} trailing={data ? String(data.joined) : "–"} />
        <ListRow title={t("referral.paying")} trailing={data ? String(data.paying) : "–"} />
        {(data?.businesses ?? []).map((business) => (
          <ListRow
            key={business.name}
            title={business.name}
            trailing={business.paying ? <Badge tone="green"><Check className="size-3.5" /> {t("referral.earned")}</Badge> : <Badge tone="neutral">{t("referral.on_trial")}</Badge>}
          />
        ))}
      </ListSection>
    </AppShell>
  );
}
