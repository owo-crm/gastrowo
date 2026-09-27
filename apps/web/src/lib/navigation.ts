import { CalendarDays, CreditCard, FileUp, House, ListTodo, Mailbox, Users, Wallet, type LucideIcon } from "lucide-react";

import { canAccessReport, canManageTeam, canViewOverview, canViewPayroll, hasPlanFeature } from "@/lib/access";
import type { MeResponse } from "@/lib/types";

export type NavGroup = "daily" | "business" | "manage";

export type NavItem = {
  to: string;
  key: string;
  icon: LucideIcon;
  group: NavGroup;
};

export const NAV_GROUP_ORDER: NavGroup[] = ["daily", "business", "manage"];

/**
 * One short menu per role. Timesheets live as a tab inside the schedule, revenue entry lives on the
 * overview for admins, and preview-only modules (documents, inventory) stay out until they are real.
 */
export function getNavItems(me?: MeResponse | null): NavItem[] {
  const items: NavItem[] = [];
  const isStaff = me?.role === "STAFF";

  if (canViewOverview(me)) items.push({ to: "/overview", key: "overview", icon: House, group: "business" });
  items.push({ to: "/schedule", key: "schedule", icon: CalendarDays, group: "daily" });
  items.push({ to: "/tasks", key: "tasks", icon: ListTodo, group: "daily" });
  // Admins enter revenue on the overview; others get the report page only when allowed.
  if (me?.role !== "ADMIN" && canAccessReport(me)) items.push({ to: "/report", key: "report", icon: FileUp, group: isStaff ? "daily" : "business" });
  if (isStaff ? hasPlanFeature(me, "payroll") : canViewPayroll(me)) items.push({ to: "/payroll", key: "payroll", icon: CreditCard, group: isStaff ? "daily" : "business" });
  if (me?.role !== "STAFF" && canManageTeam(me)) items.push({ to: "/team", key: "team", icon: Users, group: "manage" });
  if (me?.role === "ADMIN") items.push({ to: "/billing", key: "billing", icon: Wallet, group: "manage" });
  if (me?.is_platform_admin) items.push({ to: "/waitlist", key: "waitlist", icon: Mailbox, group: "manage" });

  return items.sort((a, b) => NAV_GROUP_ORDER.indexOf(a.group) - NAV_GROUP_ORDER.indexOf(b.group));
}

/** Where a user lands after login: the most useful screen their plan and role allow. */
export function getHomeRoute(me?: MeResponse | null): string {
  return canViewOverview(me) ? "/overview" : "/schedule";
}
