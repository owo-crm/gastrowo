import { Link2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
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

  return (
    <AppShell
      title={t("pending.title")}
      subtitle={t("pending.subtitle")}
      action={<Badge>{t("common.worker")}</Badge>}
    >
      <div className="mx-auto max-w-3xl">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>{t("pending.card_title")}</CardTitle>
              <CardDescription>
                {t("pending.card_description")}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                  {t("pending.flow_body")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handleRefresh}>
                {t("common.refresh")}
              </Button>
              <Button variant="secondary" onClick={logout}>
                {t("pending.sign_out")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
