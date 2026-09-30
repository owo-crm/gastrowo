import { Briefcase, CalendarDays, House, ListTodo, Rocket, Settings, Users, type LucideIcon } from "lucide-react";

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
  /** Belongs to the section (keeps its tab highlighted) but is opened from a list, not shown as a sub-tab. */
  hidden?: boolean;
};

export type NavSection = {
  key: "start" | "home" | "schedule" | "team" | "business" | "earnings" | "tasks" | "settings";
  icon: LucideIcon;
  subs: NavSub[];
};

function sub(to: string, key: string, options: { locked?: boolean; end?: boolean; hidden?: boolean } = {}): NavSub {
  return options.locked ? { to: UPGRADE_ROUTE, key, locked: true } : { to, key, end: options.end, hidden: options.hidden };
}

/** Sub-tabs that are shown in the menu (hidden ones are reached from a page, e.g. Settings rows). */
export function visibleSubs(section: NavSection): NavSub[] {
  return section.subs.filter((item) => !item.hidden);
}

/**
 * A worker's app is three tabs: Home (next shift, clock, the week), Tasks and Settings.
 * Payments, hours, calendar sync and revenue are rows in Settings.
 */
function staffSections(me?: MeResponse | null): NavSection[] {
  const homeSubs = [sub("/schedule", "home", { end: true }), sub("/schedule/availability", "availability"), sub("/schedule/requests", "requests")];
  const settingsSubs = [sub("/settings", "settings", { end: true })];
  if (hasPlanFeature(me, "payroll")) settingsSubs.push(sub("/payroll", "payments", { hidden: true }));
  if (hasPlanFeature(me, "timesheets")) settingsSubs.push(sub("/schedule/hours", "my_hours", { hidden: true }));
  if (canAccessReport(me)) settingsSubs.push(sub("/overview/revenue", "revenue", { hidden: true }));
  settingsSubs.push(sub("/settings/calendar", "calendar_sync", { hidden: true }));
  return [
    { key: "home", icon: House, subs: homeSubs },
    { key: "tasks", icon: ListTodo, subs: [sub("/tasks", "tasks")] },
    { key: "settings", icon: Settings, subs: settingsSubs },
  ];
}

/**
 * The whole app menu: a few sections, each with its own sub-tabs. Secondary information lives in a
 * sub-tab rather than on the same page, so every screen does one job.
 */
export function getNavSections(me?: MeResponse | null): NavSection[] {
  const role = me?.role;
  const isAdmin = role === "ADMIN";
  const isStaff = role === "STAFF";
  if (isStaff) return staffSections(me);
  const sections: NavSection[] = [];
  // The owner's temporary "Get started" roadmap, until they hide it.
  if (isAdmin && !me?.organization_settings?.roadmap_hidden) sections.push({ key: "start", icon: Rocket, subs: [sub("/start", "get_started")] });

  const scheduleSubs = [
    sub("/schedule", "calendar", { end: true }),
    sub("/schedule/availability", "availability"),
    sub("/schedule/requests", "requests"),
  ];
  if (hasPlanFeature(me, "timesheets")) scheduleSubs.push(sub("/schedule/hours", "hours"));
  else if (isAdmin) scheduleSubs.push(sub("/schedule/hours", "hours", { locked: true }));
  sections.push({ key: "schedule", icon: CalendarDays, subs: scheduleSubs });

  if (canManageTeam(me)) {
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

  const businessSubs: NavSub[] = [];
  if (canViewOverview(me)) businessSubs.push(sub("/overview", "overview", { end: true }));
  else if (isAdmin) businessSubs.push(sub("/overview", "overview", { locked: true }));
  if (canAccessReport(me)) businessSubs.push(sub("/overview/revenue", "revenue"));
  else if (isAdmin) businessSubs.push(sub("/overview/revenue", "revenue", { locked: true }));
  if (canViewPayroll(me)) businessSubs.push(sub("/payroll", "payroll"));
  else if (isAdmin) businessSubs.push(sub("/payroll", "payroll", { locked: true }));
  if (businessSubs.length) sections.push({ key: "business", icon: Briefcase, subs: businessSubs });

  sections.push({ key: "tasks", icon: ListTodo, subs: [sub("/tasks", "tasks")] });

  const settingsSubs = [sub("/settings", "profile", { end: true })];
  if (canManageBusinessSettings(me)) settingsSubs.push(sub("/settings/business", "business"));
  settingsSubs.push(sub("/settings/calendar", "calendar_sync"));
  if (isAdmin) settingsSubs.push(sub("/settings/billing", "billing"));
  // Platofy-internal analytics.
  if (me?.is_platform_admin) {
    settingsSubs.push(sub("/platform", "platform", { end: true }));
    settingsSubs.push(sub("/platform/support", "support_inbox"));
  }
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
