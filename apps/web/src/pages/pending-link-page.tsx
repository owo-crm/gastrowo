import { LogOut, Mail, RefreshCw } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

/** Signed in, but not part of any business yet: only an invite from a manager fixes that. */
export function PendingLinkPage() {
  const { logout, refreshMe, me } = useAuth();
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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--color-bg)] px-6 py-10 text-center">
      <BrandLogo kind="wordmark" className="text-[1.8rem]" />
      <span className="mt-10 grid size-20 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-primary-strong)]">
        <Mail className="size-9" />
      </span>
      <h1 className="mt-6 text-[26px] font-semibold text-black">{t("pending.waiting_title")}</h1>
      <p className="mt-2 max-w-sm text-[16px] leading-6 text-[var(--color-text-muted)]">{t("pending.waiting_body", { email: me?.email ?? "" })}</p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <Button size="lg" onClick={handleRefresh}>
          <RefreshCw className="size-5" /> {t("pending.check_again")}
        </Button>
        <Button size="lg" variant="plain" onClick={() => void handleSignOut()}>
          <LogOut className="size-5" /> {t("pending.sign_out")}
        </Button>
      </div>
    </main>
  );
}
