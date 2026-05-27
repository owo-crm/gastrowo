import { CalendarDays, CreditCard, FileText, FileUp, House, ListTodo, Users, type LucideIcon } from "lucide-react";

import { canAccessNotes, canAccessReport, canManageTeam, canViewOverview } from "@/lib/access";
import type { MeResponse } from "@/lib/types";

export type NavItem = {
  to: string;
  key: string;
  icon: LucideIcon;
};

export function getNavItems(me?: MeResponse | null): NavItem[] {
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
    return [
      { to: "/overview", key: "overview", icon: House },
      { to: "/report", key: "report", icon: FileUp },
      { to: "/schedule", key: "schedule", icon: CalendarDays },
      { to: "/payroll", key: "payroll", icon: CreditCard },
      { to: "/tasks", key: "tasks", icon: ListTodo },
      { to: "/team", key: "team", icon: Users },
      { to: "/notes", key: "notes", icon: FileText },
    ];
  }

  if (me?.role === "MANAGER") {
    const items: NavItem[] = [];
    if (canViewOverview(me)) items.push({ to: "/overview", key: "overview", icon: House });
    items.push({ to: "/report", key: "report", icon: FileUp }, ...managerBase);
    if (canManageTeam(me)) items.push({ to: "/team", key: "team", icon: Users });
    if (canAccessNotes(me)) items.push({ to: "/notes", key: "notes", icon: FileText });
    return items;
  }

  const items = [...workerBase];
  if (canAccessReport(me)) items.push({ to: "/report", key: "report", icon: FileUp });
  return items;
}
