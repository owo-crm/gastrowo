import { CalendarDays, CreditCard, FileClock, FileText, FileUp, House, ListTodo, Mailbox, Users, Wallet, type LucideIcon } from "lucide-react";

import { canAccessNotes, canAccessReport, canManageTeam, canViewOverview, canViewPayroll, hasPlanFeature } from "@/lib/access";
import type { MeResponse } from "@/lib/types";

export type NavItem = {
  to: string;
  key: string;
  icon: LucideIcon;
};

export function getNavItems(me?: MeResponse | null): NavItem[] {
  return filterByPlan(me, getRoleNavItems(me));
}

// Hide sections the workspace plan doesn't include instead of showing pages that fail with 402.
function filterByPlan(me: MeResponse | null | undefined, items: NavItem[]): NavItem[] {
  return items.filter((item) => {
    if (item.key === "timesheets") return hasPlanFeature(me, "timesheets");
    if (item.key === "payroll") return me?.role === "STAFF" ? hasPlanFeature(me, "payroll") : canViewPayroll(me);
    if (item.key === "overview") return canViewOverview(me);
    if (item.key === "report") return canAccessReport(me);
    return true;
  });
}

function getRoleNavItems(me?: MeResponse | null): NavItem[] {
  const workerBase: NavItem[] = [
    { to: "/schedule", key: "schedule", icon: CalendarDays },
    { to: "/payroll", key: "payroll", icon: CreditCard },
    { to: "/tasks", key: "tasks", icon: ListTodo },
  ];
  const managerBase: NavItem[] = [
    { to: "/schedule", key: "schedule", icon: CalendarDays },
    { to: "/payroll", key: "payroll", icon: CreditCard },
    { to: "/tasks", key: "tasks", icon: ListTodo },
  ];

  if (me?.role === "ADMIN") {
    const items: NavItem[] = [
      { to: "/overview", key: "overview", icon: House },
      { to: "/report", key: "report", icon: FileUp },
      { to: "/schedule", key: "schedule", icon: CalendarDays },
      { to: "/timesheets", key: "timesheets", icon: FileClock },
      { to: "/payroll", key: "payroll", icon: CreditCard },
      { to: "/tasks", key: "tasks", icon: ListTodo },
      { to: "/team", key: "team", icon: Users },
      { to: "/notes", key: "notes", icon: FileText },
      { to: "/billing", key: "billing", icon: Wallet },
    ];
    // Waitlist leads are GastrOWO-internal, not restaurant data.
    if (me.is_platform_admin) items.push({ to: "/waitlist", key: "waitlist", icon: Mailbox });
    return items;
  }

  if (me?.role === "MANAGER") {
    const items: NavItem[] = [];
    if (canViewOverview(me)) items.push({ to: "/overview", key: "overview", icon: House });
    items.push({ to: "/report", key: "report", icon: FileUp }, { to: "/timesheets", key: "timesheets", icon: FileClock }, ...managerBase);
    if (canManageTeam(me)) items.push({ to: "/team", key: "team", icon: Users });
    if (canAccessNotes(me)) items.push({ to: "/notes", key: "notes", icon: FileText });
    return items;
  }

  const items = [...workerBase];
  if (canAccessReport(me)) items.push({ to: "/report", key: "report", icon: FileUp });
  return items;
}
