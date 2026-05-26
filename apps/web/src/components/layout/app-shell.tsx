import { type ReactNode } from "react";

import { DashboardWithCollapsibleSidebar } from "@/components/ui/dashboard-with-collapsible-sidebar";

export function AppShell({
  children,
  title,
  subtitle,
  action,
  headerVariant,
  restaurantName,
  hideBottomNav,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  headerVariant?: "default" | "minimal";
  restaurantName?: string;
  hideBottomNav?: boolean;
}) {
  return (
    <DashboardWithCollapsibleSidebar
      title={title}
      subtitle={subtitle}
      action={action}
      headerVariant={headerVariant}
      restaurantName={restaurantName}
      hideBottomNav={hideBottomNav}
    >
      {children}
    </DashboardWithCollapsibleSidebar>
  );
}
