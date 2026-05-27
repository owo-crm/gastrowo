import { Link2, LogOut, RefreshCw } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

export function PendingLinkPage() {
  const { logout, refreshMe } = useAuth();
  const toast = useToast();
  const { t } = useLanguage();

  const handleRefresh = async () => {
    try {
      await refreshMe();
      toast.success(t("pending.refresh_success"));
    } catch {
      toast.error(t("pending.refresh_error"), t("pending.refresh_error_body"));
    }
  };

  const handleSignOut = async () => {
    await logout();
    window.location.replace("/login");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_42%,#ffffff_100%)] px-4 py-6 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(47,111,237,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.10),transparent_20%)]" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-3rem)] max-w-3xl flex-col justify-center">
        <div className="mb-6 flex justify-center">
          <BrandLogo kind="wordmark" className="h-10 w-auto" />
        </div>
        <Card className="overflow-hidden border border-[rgba(215,224,238,0.96)] bg-white/92 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <CardHeader className="space-y-3 pb-2 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[rgba(37,99,235,0.16)] bg-[rgba(37,99,235,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#2563eb]">
              {t("common.worker")}
            </div>
            <div>
              <CardTitle className="text-[1.9rem] tracking-[-0.05em] text-[var(--color-heading)]">{t("pending.card_title")}</CardTitle>
              <CardDescription className="mx-auto mt-2 max-w-[34rem] text-sm leading-6 text-[var(--color-text-muted)]">
                {t("pending.card_description")}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-white px-4 py-4">
                <p className="text-sm font-semibold text-[var(--color-heading)]">{t("pending.next_title")}</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  <li>{t("pending.step_1")}</li>
                  <li>{t("pending.step_2")}</li>
                  <li>{t("pending.step_3")}</li>
                </ul>
              </div>
              <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[linear-gradient(140deg,rgba(47,111,237,0.10),rgba(255,255,255,0.90))] px-4 py-4">
                <div className="inline-flex items-center gap-2 text-[var(--color-heading)]">
                  <Link2 className="size-4 text-emerald-600" />
                  {t("pending.flow_title")}
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">{t("pending.flow_body")}</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" className="min-h-11 flex-1" onClick={handleRefresh}>
                <RefreshCw className="size-4" />
                {t("common.refresh")}
              </Button>
              <Button variant="secondary" className="min-h-11 flex-1" onClick={() => void handleSignOut()}>
                <LogOut className="size-4" />
                {t("pending.sign_out")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
