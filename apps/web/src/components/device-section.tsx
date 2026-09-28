import { useEffect, useState } from "react";
import { Bell, Download, Share } from "lucide-react";

import { ListRow, ListSection } from "@/components/ui/list";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { canPromptInstall, currentPushSubscription, disablePush, enablePush, isIos, isStandalone, onInstallAvailabilityChange, promptInstall, pushSupported } from "@/lib/pwa";
import { useToast } from "@/lib/toast";

/** "This device": push notifications and installing Platofy on the Home Screen. */
export function DeviceSection() {
  const { token } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installable, setInstallable] = useState(canPromptInstall);
  const standalone = isStandalone();
  const iosNeedsInstall = isIos() && !standalone;
  const supported = pushSupported() && !iosNeedsInstall;

  useEffect(() => {
    const unsubscribe = onInstallAvailabilityChange(() => setInstallable(canPromptInstall()));
    return () => {
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!supported) return;
    void currentPushSubscription().then((subscription) => setPushOn(Boolean(subscription) && Notification.permission === "granted"));
  }, [supported]);

  const togglePush = async (next: boolean) => {
    if (!token) return;
    setBusy(true);
    try {
      if (next) {
        const result = await enablePush(token);
        if (result === "denied") toast.error(t("device.push_denied"), t("device.push_denied_body"));
        setPushOn(result === "on");
      } else {
        await disablePush(token);
        setPushOn(false);
      }
    } catch (error) {
      toast.error(t("device.push_failed"), error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ListSection header={t("device.header")} footer={iosNeedsInstall ? t("device.ios_footer") : t("device.footer")}>
      {supported ? (
        <ListRow
          leading={<Bell className="size-5 text-[var(--color-primary-strong)]" />}
          title={t("device.push")}
          trailing={<Switch checked={pushOn} onChange={(value) => void togglePush(value)} label={t("device.push")} disabled={busy} />}
        />
      ) : null}
      {!standalone && installable ? (
        <ListRow
          leading={<Download className="size-5 text-[var(--color-primary-strong)]" />}
          title={<span className="font-semibold text-[var(--color-primary-strong)]">{t("device.install")}</span>}
          chevron
          onClick={() => void promptInstall()}
        />
      ) : null}
      {iosNeedsInstall ? (
        <ListRow
          leading={<Share className="size-5 text-[var(--color-primary-strong)]" />}
          title={t("device.ios_install")}
          subtitle={t("device.ios_install_steps")}
        />
      ) : null}
      {standalone ? <ListRow leading={<Download className="size-5 text-[var(--color-success)]" />} title={t("device.installed")} /> : null}
      {!supported && !iosNeedsInstall ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("device.push_unsupported")}</span>} /> : null}
    </ListSection>
  );
}
