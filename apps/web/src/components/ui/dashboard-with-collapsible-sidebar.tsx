import { type ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, Clock3, Coins, CreditCard, FilePlus2, HelpCircle, LogOut, Settings, Sparkles, Trash2, UserCircle2, XCircle } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

import { BottomNav } from "@/components/layout/bottom-nav";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadBusinessLogo } from "@/lib/business-branding";
import { getNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type DashboardWithCollapsibleSidebarProps = {
  children: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  headerVariant?: "default" | "minimal";
  restaurantName?: string;
};

function formatNotificationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${day}.${month} ${hours}:${minutes}`;
}

function notificationPresentation(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("completed") || normalized.includes("approved") || normalized.includes("corrected")) {
    return { Icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700" };
  }
  if (normalized.includes("rejected") || normalized.includes("deleted")) {
    return { Icon: XCircle, className: "bg-red-50 text-red-600" };
  }
  if (normalized.includes("revenue")) {
    return { Icon: Coins, className: "bg-amber-50 text-amber-700" };
  }
  if (normalized.includes("timesheet")) {
    return { Icon: Clock3, className: "bg-sky-50 text-sky-700" };
  }
  if (normalized.includes("task")) {
    return { Icon: FilePlus2, className: "bg-indigo-50 text-indigo-700" };
  }
  return { Icon: Bell, className: "bg-[var(--color-accent)] text-[var(--color-primary)]" };
}

const navLabels: Record<string, string> = {
  overview: "Overview",
  report: "Report",
  schedule: "Schedule",
  tasks: "Tasks",
  notes: "Notes & Documents",
  inventory: "Inventory",
  team: "Team",
  profile: "Profile",
};

export function DashboardWithCollapsibleSidebar({
  children,
  title,
  subtitle,
  action,
  headerVariant = "default",
}: DashboardWithCollapsibleSidebarProps) {
  const { token, me, logout } = useAuth();
  const queryClient = useQueryClient();
  const navItems = getNavItems(me);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const [workspaceLogo, setWorkspaceLogo] = useState<string | null>(null);

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.listNotifications(token!, 20),
    enabled: Boolean(token),
    refetchInterval: 30000,
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (notificationId: string) => api.deleteNotification(token!, notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  useEffect(() => {
    setWorkspaceLogo(loadBusinessLogo(me?.active_organization_id));
  }, [me?.active_organization_id]);

  useEffect(() => {
    const onBrandingUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ organizationId: string | null; logoUrl: string | null }>).detail;
      if ((detail?.organizationId ?? null) !== (me?.active_organization_id ?? null)) return;
      setWorkspaceLogo(detail?.logoUrl ?? null);
    };
    window.addEventListener("business-branding-updated", onBrandingUpdate as EventListener);
    return () => window.removeEventListener("business-branding-updated", onBrandingUpdate as EventListener);
  }, [me?.active_organization_id]);

  useEffect(() => {
    if (!menuOpen && !notificationsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || notificationsRef.current?.contains(target)) return;
      setMenuOpen(false);
      setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen, notificationsOpen]);

  const workspaceName = me?.active_organization_name ?? "Workspace";
  const workspaceInitials = workspaceName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase() ?? "")
    .join("") || "GW";

  return (
    <div className="relative min-h-screen overflow-x-hidden app-canvas text-[var(--color-text)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(47,111,237,0.10),transparent_24%),radial-gradient(circle_at_top_right,rgba(104,240,93,0.08),transparent_22%)]" />
      <div className="relative mx-auto min-h-screen max-w-[1600px] lg:flex">
        <aside className="sidebar-surface fixed inset-y-0 left-0 z-40 hidden h-screen w-[272px] shrink-0 flex-col overflow-y-auto px-5 py-6 lg:flex">
          <Link to="/overview" className="inline-flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-[1rem] bg-[var(--color-primary)] text-white shadow-[0_12px_28px_rgba(47,111,237,0.22)]">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tracking-[-0.04em] text-[var(--color-heading)]">GastrOWO</p>
              <p className="text-sm text-[var(--color-text-muted)]">Restaurant workspace</p>
            </div>
          </Link>

          <div className="mt-8 px-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Workspace</p>
          </div>

          <nav className="mt-3 flex flex-col gap-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 items-center gap-3 rounded-[1rem] px-3.5 text-sm font-medium transition",
                    isActive
                      ? "bg-[var(--color-accent)] text-[var(--color-primary)] shadow-[inset_0_0_0_1px_rgba(47,111,237,0.12)]"
                      : "text-[var(--color-text-muted)] hover:bg-white hover:text-[var(--color-heading)]",
                  )
                }
              >
                <item.icon className="size-4" aria-hidden />
                <span>{navLabels[item.key] ?? item.key}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto border-t border-[var(--color-divider)] pt-5">
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-3 rounded-[1rem] px-3.5 text-left text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-white hover:text-[var(--color-heading)]"
            >
              <HelpCircle className="size-4" />
              Support
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-3 pb-28 pt-3 sm:px-4 md:px-5 lg:ml-[272px] lg:px-7 lg:pb-8 lg:pt-5">
          <header className="sticky top-2 z-30 sm:top-3">
            <div className="surface-elevated flex min-h-[56px] items-center gap-2 rounded-[1.1rem] px-3 sm:min-h-[64px] sm:gap-3 sm:rounded-[1.25rem] sm:px-4 md:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <Link to={me?.role === "ADMIN" ? "/overview" : me?.role === "MANAGER" ? "/report" : "/schedule"} className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[0.9rem] bg-[var(--color-primary)] text-white sm:size-10 sm:rounded-[0.95rem]">
                  {workspaceLogo ? <img src={workspaceLogo} alt={workspaceName} className="size-full object-cover" /> : <Sparkles className="size-4" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Workspace</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--color-heading)] sm:text-base">{workspaceName}</p>
                  </div>
                </div>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-2">
                <div className="relative" ref={notificationsRef}>
                  <button
                    type="button"
                    className="relative grid size-9 place-items-center rounded-[0.85rem] border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] transition hover:text-[var(--color-heading)] sm:size-10 sm:rounded-[0.95rem]"
                    aria-label="Notifications"
                    onClick={() => {
                      setNotificationsOpen((current) => !current);
                      setMenuOpen(false);
                    }}
                  >
                    <Bell className="size-4" />
                    {(notificationsQuery.data?.length ?? 0) > 0 ? (
                      <span className="absolute right-2 top-2 size-2 rounded-full bg-[var(--color-danger)]" />
                    ) : null}
                  </button>
                  {notificationsOpen ? (
                    <div className="surface-elevated absolute right-0 top-11 z-50 w-[min(380px,calc(100vw-1.5rem))] rounded-[1rem] p-2 sm:top-12 sm:w-[min(380px,calc(100vw-2rem))]">
                      <div className="flex items-center justify-between gap-3 px-2 py-2">
                        <p className="text-sm font-semibold text-[var(--color-heading)]">Notifications</p>
                        <Badge>{notificationsQuery.data?.length ?? 0}</Badge>
                      </div>
                      <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                        {(notificationsQuery.data ?? []).map((item) => {
                          const presentation = notificationPresentation(item.title);
                          return (
                            <div key={item.id} className="group flex items-start gap-3 rounded-[0.9rem] px-2 py-2 transition hover:bg-[var(--color-surface-muted)]">
                              <div className={`mt-1 grid size-8 shrink-0 place-items-center rounded-[0.75rem] ${presentation.className}`}>
                                <presentation.Icon className="size-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{item.title}</p>
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-md p-1 text-[var(--color-text-muted)] opacity-70 transition hover:bg-white hover:text-[var(--color-danger)] group-hover:opacity-100"
                                    aria-label="Delete notification"
                                    onClick={() => deleteNotificationMutation.mutate(item.id)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">{item.body}</p>
                                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{formatNotificationDate(item.created_at)}</p>
                              </div>
                            </div>
                          );
                        })}
                        {!notificationsQuery.data?.length ? (
                          <div className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">No notifications yet.</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center gap-2 rounded-[0.85rem] border border-[var(--color-border)] bg-white px-2 text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)] sm:min-h-10 sm:rounded-[0.95rem] sm:px-2.5"
                    onClick={() => {
                      setNotificationsOpen(false);
                      setMenuOpen((current) => !current);
                    }}
                    aria-label="User menu"
                  >
                    <UserCircle2 className="size-4" />
                    <span className="hidden text-sm font-medium md:inline">{me?.full_name ?? "Account"}</span>
                  </button>
                  {menuOpen ? (
                    <div className="surface-elevated absolute right-0 top-11 z-40 min-w-[180px] rounded-[1rem] p-1.5 sm:top-12 sm:min-w-[190px]">
                      {me?.role === "ADMIN" ? (
                        <Link
                          to="/billing"
                          className="flex min-h-10 items-center gap-2 rounded-[0.8rem] px-3 text-sm text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]"
                          onClick={() => setMenuOpen(false)}
                        >
                          <CreditCard className="size-4 text-[var(--color-text-muted)]" />
                          Billing
                        </Link>
                      ) : null}
                      <Link
                        to="/profile"
                        className="flex min-h-10 items-center gap-2 rounded-[0.8rem] px-3 text-sm text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Settings className="size-4 text-[var(--color-text-muted)]" />
                        Settings
                      </Link>
                      <button
                        type="button"
                        className="flex min-h-10 w-full items-center gap-2 rounded-[0.8rem] px-3 text-left text-sm text-[var(--color-danger)] transition hover:bg-red-50"
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                      >
                        <LogOut className="size-4" />
                        Log out
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          {headerVariant === "default" ? (
            <section className="mb-4 mt-4 flex flex-col gap-2 sm:mb-5 sm:mt-5 sm:gap-3 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <h1 className="mt-1 text-[1.65rem] font-bold tracking-[-0.05em] text-[var(--color-heading)] sm:text-[2rem] md:text-[2.2rem]">{title}</h1>
                {subtitle ? <p className="mt-1 max-w-3xl text-[13px] leading-5 text-[var(--color-text-muted)] sm:mt-1.5 sm:text-sm sm:leading-6">{subtitle}</p> : null}
              </div>
              {action ? <div className="w-full min-w-0 md:w-auto">{action}</div> : null}
            </section>
          ) : (
            <div className="mt-4">{action ? <div className="flex justify-end">{action}</div> : null}</div>
          )}

          <main className="min-w-0 page-reveal">{children}</main>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

export function Example() {
  return (
    <DashboardWithCollapsibleSidebar title="Workspace" subtitle="Demo shell preview">
      <div className="surface-card rounded-[1.5rem] px-5 py-8 text-sm text-[var(--color-text-muted)]">Demo shell preview</div>
    </DashboardWithCollapsibleSidebar>
  );
}

export default DashboardWithCollapsibleSidebar;
