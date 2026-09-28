import { Briefcase, CalendarDays, ListTodo, Settings, Users, Wallet, type LucideIcon } from "lucide-react";

import { canAccessReport, canManageBusinessSettings, canManageTeam, canViewOverview, canViewPayroll, hasPlanFeature } from "@/lib/access";
import type { MeResponse } from "@/lib/types";

export const UPGRADE_ROUTE = "/settings/billing";

export type NavSub = {
  to: string;
  /** i18n key under `sub.*` */
  key: string;
  /** Not in the workspace plan: shown with a lock and leads to billing. */
  locked?: boolean;
  /** Match only this exact path (section roots), not everything below it. */
  end?: boolean;
};

export type NavSection = {
  key: "schedule" | "team" | "business" | "earnings" | "tasks" | "settings";
  icon: LucideIcon;
  subs: NavSub[];
};

function sub(to: string, key: string, options: { locked?: boolean; end?: boolean } = {}): NavSub {
  return options.locked ? { to: UPGRADE_ROUTE, key, locked: true } : { to, key, end: options.end };
}

/**
 * The whole app menu: a few sections, each with its own sub-tabs. Secondary information lives in a
 * sub-tab rather than on the same page, so every screen does one job.
 */
export function getNavSections(me?: MeResponse | null): NavSection[] {
  const role = me?.role;
  const isAdmin = role === "ADMIN";
  const isStaff = role === "STAFF";
  const sections: NavSection[] = [];

  const scheduleSubs = [
    sub("/schedule", isStaff ? "my_week" : "calendar", { end: true }),
    sub("/schedule/availability", "availability"),
    sub("/schedule/requests", "requests"),
  ];
  if (hasPlanFeature(me, "timesheets")) scheduleSubs.push(sub("/schedule/hours", "hours"));
  else if (isAdmin) scheduleSubs.push(sub("/schedule/hours", "hours", { locked: true }));
  sections.push({ key: "schedule", icon: CalendarDays, subs: scheduleSubs });

  if (!isStaff && canManageTeam(me)) {
    const teamSubs = [
      sub("/team", "people", { end: true }),
      sub("/team/invites", "invites"),
      sub("/team/positions", "positions"),
      sub("/team/locations", "locations"),
      sub("/team/templates", "templates"),
    ];
    if (isAdmin) teamSubs.push(sub("/team/permissions", "permissions", { locked: !hasPlanFeature(me, "permissions") }));
    sections.push({ key: "team", icon: Users, subs: teamSubs });
  }

  if (isStaff) {
    const subs: NavSub[] = [];
    if (hasPlanFeature(me, "payroll")) subs.push(sub("/payroll", "payroll"));
    if (canAccessReport(me)) subs.push(sub("/overview/revenue", "revenue"));
    if (subs.length) sections.push({ key: "earnings", icon: Wallet, subs });
  } else {
    const subs: NavSub[] = [];
    if (canViewOverview(me)) subs.push(sub("/overview", "overview", { end: true }));
    else if (isAdmin) subs.push(sub("/overview", "overview", { locked: true }));
    if (canAccessReport(me)) subs.push(sub("/overview/revenue", "revenue"));
    else if (isAdmin) subs.push(sub("/overview/revenue", "revenue", { locked: true }));
    if (canViewPayroll(me)) subs.push(sub("/payroll", "payroll"));
    else if (isAdmin) subs.push(sub("/payroll", "payroll", { locked: true }));
    if (subs.length) sections.push({ key: "business", icon: Briefcase, subs });
  }

  sections.push({ key: "tasks", icon: ListTodo, subs: [sub("/tasks", "tasks")] });

  const settingsSubs = [sub("/settings", "profile", { end: true })];
  if (canManageBusinessSettings(me)) settingsSubs.push(sub("/settings/business", "business"));
  settingsSubs.push(sub("/settings/calendar", "calendar_sync"));
  if (isAdmin) settingsSubs.push(sub("/settings/billing", "billing"));
  // GastrOWO-internal: waitlist leads from the landing page.
  if (me?.is_platform_admin) settingsSubs.push(sub("/waitlist", "waitlist"));
  sections.push({ key: "settings", icon: Settings, subs: settingsSubs });

  return sections;
}

/** The section and sub-tab that own a path: the longest matching route wins. */
export function findActive(sections: NavSection[], pathname: string): { section: NavSection; sub: NavSub } | null {
  let best: { section: NavSection; sub: NavSub } | null = null;
  for (const section of sections) {
    for (const item of section.subs) {
      if (item.locked) continue;
      const matches = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (matches && (!best || item.to.length > best.sub.to.length)) best = { section, sub: item };
    }
  }
  return best;
}

/** Where a user lands after login: the most useful screen their plan and role allow. */
export function getHomeRoute(me?: MeResponse | null): string {
  return canViewOverview(me) ? "/overview" : "/schedule";
}
