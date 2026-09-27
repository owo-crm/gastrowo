import { NavLink } from "react-router-dom";

import { hasPlanFeature } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Schedule and hour approvals are one area for managers: two tabs instead of two menu items. */
export function ScheduleTabs({ pendingCount }: { pendingCount: number }) {
  const { me } = useAuth();
  const { t } = useLanguage();
  if (!hasPlanFeature(me, "timesheets")) return null;

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "inline-flex min-h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
      isActive ? "bg-white text-[var(--color-heading)] shadow-sm" : "text-[var(--color-text-muted)] hover:text-[var(--color-heading)]",
    );

  return (
    <nav className="inline-flex rounded-xl bg-[var(--color-surface-muted)] p-1" aria-label={t("schedule.tab.schedule")}>
      <NavLink to="/schedule" end className={tabClass}>
        {t("schedule.tab.schedule")}
      </NavLink>
      <NavLink to="/timesheets" className={tabClass}>
        {t("schedule.tab.hours")}
        {pendingCount > 0 ? (
          <span className="grid min-w-5 place-items-center rounded-full bg-[var(--color-danger)] px-1.5 text-[11px] font-bold leading-5 text-white">{pendingCount}</span>
        ) : null}
      </NavLink>
    </nav>
  );
}
