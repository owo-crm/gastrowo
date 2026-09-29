import { Lock } from "lucide-react";

import { ListRow, ListSection } from "@/components/ui/list";
import { useLanguage } from "@/lib/i18n";

/** Shown in the public demo where a feature is turned off (kiosk, billing, invites). */
export function DemoOffNote({ header, body }: { header?: string; body: string }) {
  const { t } = useLanguage();
  return (
    <ListSection header={header}>
      <ListRow
        leading={<Lock className="size-5 text-[var(--color-text-muted)]" />}
        title={<span className="font-semibold">{t("demo.off_title")}</span>}
        subtitle={body}
      />
    </ListSection>
  );
}
