import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, Clock3, Coins, CreditCard, FilePlus2, HelpCircle, LogOut, Settings, Trash2, UserCircle2, XCircle } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { BrandLogo } from "@/components/brand-logo";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadBusinessLogo } from "@/lib/business-branding";
import { formatRelativeTimestamp } from "@/lib/date";
import { useLanguage } from "@/lib/i18n";
import { getNavItems } from "@/lib/navigation";
import type { NotificationItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type DashboardWithCollapsibleSidebarProps = {
  children: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  headerVariant?: "default" | "minimal";
  restaurantName?: string;
  hideBottomNav?: boolean;
};

function notificationPresentation(item: NotificationItem) {
  if (item.type === "billing") {
    return { Icon: CreditCard, className: "bg-amber-50 text-amber-700" };
  }
  if (item.type === "report") {
    return { Icon: Coins, className: "bg-amber-50 text-amber-700" };
  }
  if (item.type === "timesheet") {
    return { Icon: Clock3, className: "bg-sky-50 text-sky-700" };
  }
  if (item.type === "task") {
    return { Icon: FilePlus2, className: "bg-indigo-50 text-indigo-700" };
  }
  const normalized = item.title.toLowerCase();
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

export function DashboardWithCollapsibleSidebar({
  children,
  title,
  subtitle,
  action,
  headerVariant = "default",
  hideBottomNav = false,
}: DashboardWithCollapsibleSidebarProps) {
  const { token, me, logout } = useAuth();
  const { t, lang } = useLanguage();
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

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) => api.markNotificationsRead(token!, ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notificationItems = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.unread_count ?? 0;
  const unreadNotifications = useMemo(() => notificationItems.filter((item) => !item.read_at), [notificationItems]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const unreadIds = unreadNotifications.map((item) => item.id);
    if (!unreadIds.length || markReadMutation.isPending) return;
    markReadMutation.mutate(unreadIds);
  }, [notificationsOpen, unreadNotifications, markReadMutation]);

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

  const workspaceName = me?.active_organization_name ?? t("common.workspace");
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
        <aside className="sidebar-surface fixed inset-y-0 left-0 z-40 hidden h-screen w-[272px] shrink-0 flex-col overflow-y-auto px-5 py-1 lg:flex">
          <Link to="/overview" className="flex justify-center">
            <div className="flex w-full">
              <BrandLogo kind="mark" tone="dark" className="size-32" px-1/>
            </div>
          </Link>

          <div className="mt-1 px-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">{t("shell.workspace_label")}</p>
          </div>

          <nav className="mt-3 flex flex-col gap-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 items-center gap-3 rounded-[1rem] px-3.5 text-sm font-medium transition-all duration-300 relative",
                    isActive
                      ? "bg-[rgba(47,111,237,0.08)] text-[var(--color-primary)] font-semibold shadow-[inset_0_0_0_1px_rgba(47,111,237,0.12)]"
                      : "text-[var(--color-text-muted)] hover:bg-white hover:text-[var(--color-heading)]",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn("size-4 transition-transform duration-300", isActive && "scale-[1.15] text-[var(--color-primary)]")} aria-hidden />
                    <span>{t(`nav.${item.key}`)}</span>
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active-indicator"
                        className="absolute left-0 w-1 h-6 bg-[var(--color-primary)] rounded-r-full"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto border-t border-[var(--color-divider)] pt-5">
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-3 rounded-[1rem] px-3.5 text-left text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-white hover:text-[var(--color-heading)]"
            >
              <HelpCircle className="size-4" />
              {t("common.support")}
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-3 pb-28 pt-3 sm:px-4 md:px-5 lg:ml-[272px] lg:px-7 lg:pb-8 lg:pt-5">
          <header className="sticky top-2 z-30 sm:top-3">
            <div className="glass-surface glass-halo flex min-h-[56px] items-center gap-2 rounded-[1.3rem] px-3 sm:min-h-[64px] sm:gap-3 sm:rounded-[1.45rem] sm:px-4 md:px-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <Link to={me?.role === "ADMIN" ? "/overview" : me?.role === "MANAGER" ? "/report" : "/schedule"} className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[0.95rem] bg-[var(--color-primary)] text-white sm:size-10 sm:rounded-[1.05rem]">
                  {workspaceLogo ? <img src={workspaceLogo} alt={workspaceName} className="size-full object-cover" /> : <BrandLogo kind="mark" tone="light" className="size-full" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">{t("shell.workspace_label")}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--color-heading)] sm:text-base">{workspaceName}</p>
                  </div>
                </div>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-2">
                <div className="relative" ref={notificationsRef}>
                  <button
                    type="button"
                    className="relative grid size-9 place-items-center rounded-[0.9rem] border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] transition hover:text-[var(--color-heading)] sm:size-10 sm:rounded-[1rem]"
                    aria-label={t("common.notifications")}
                    onClick={() => {
                      setNotificationsOpen((current) => !current);
                      setMenuOpen(false);
                    }}
                  >
                    <Bell className="size-4" />
                    {unreadCount > 0 ? (
                      <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-[var(--color-danger)] animate-pulse" />
                    ) : null}
                  </button>
                  <AnimatePresence>
                    {notificationsOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="glass-surface glass-halo fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-50 rounded-[1.3rem] border border-[rgba(148,163,184,0.18)] p-3 shadow-[0_24px_50px_rgba(15,23,42,0.12)] sm:absolute sm:right-0 sm:top-12 sm:w-[min(380px,calc(100vw-2rem))] sm:inset-x-auto"
                      >
                        <div className="flex items-center justify-between gap-3 px-2 pb-3 mb-2 border-b border-[var(--color-divider)]">
                          <p className="text-sm font-semibold text-[var(--color-heading)]">{t("common.notifications")}</p>
                          <Badge className="bg-[var(--color-accent)] text-[var(--color-primary)] border-transparent">
                            {t("shell.notification_count", { count: unreadCount })}
                          </Badge>
                        </div>
                        <div className="max-h-[min(60dvh,380px)] space-y-1.5 overflow-y-auto pr-1">
                          {notificationItems.map((item: NotificationItem) => {
                            const presentation = notificationPresentation(item);
                            return (
                              <div
                                key={item.id}
                                className={cn(
                                  "group flex items-start gap-3 rounded-[0.95rem] px-2.5 py-2.5 transition hover:bg-[var(--color-surface-muted)]",
                                  !item.read_at && "bg-[rgba(47,111,237,0.04)]",
                                )}
                              >
                                <div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-[0.8rem] ${presentation.className}`}>
                                  <presentation.Icon className="size-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{item.title}</p>
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-md p-1 text-[var(--color-text-muted)] opacity-0 transition hover:bg-white hover:text-[var(--color-danger)] group-hover:opacity-100"
                                      aria-label={t("shell.delete_notification")}
                                      onClick={() => deleteNotificationMutation.mutate(item.id)}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </div>
                                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">{item.body}</p>
                                  <p className="mt-1 text-[10px] font-semibold tracking-wide text-[var(--color-text-muted)]">
                                    {formatRelativeTimestamp(item.created_at, {
                                      todayLabel: t("common.today"),
                                      yesterdayLabel: t("common.yesterday"),
                                      locale: lang,
                                    })}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          {!notificationItems.length ? (
                            <div className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">{t("common.no_notifications")}</div>
                          ) : null}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center gap-2 rounded-[0.9rem] border border-[var(--color-border)] bg-white px-2.5 text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)] sm:min-h-10 sm:rounded-[1rem] sm:px-3"
                    onClick={() => {
                      setNotificationsOpen(false);
                      setMenuOpen((current) => !current);
                    }}
                    aria-label={t("shell.user_menu")}
                  >
                    <UserCircle2 className="size-4" />
                    <span className="hidden text-sm font-medium md:inline">{me?.full_name ?? t("common.account")}</span>
                  </button>
                  <AnimatePresence>
                    {menuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="glass-surface glass-halo absolute right-0 top-11 z-40 min-w-[180px] rounded-[1.2rem] p-2 sm:top-12 sm:min-w-[190px] shadow-[0_24px_50px_rgba(15,23,42,0.12)] border border-[rgba(148,163,184,0.18)]"
                      >
                        {me?.role === "ADMIN" ? (
                          <Link
                            to="/billing"
                            className="flex min-h-10 items-center gap-2 rounded-[0.9rem] px-3 text-sm text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]"
                            onClick={() => setMenuOpen(false)}
                          >
                            <CreditCard className="size-4 text-[var(--color-text-muted)]" />
                            {t("common.billing")}
                          </Link>
                        ) : null}
                        <Link
                          to="/profile"
                          className="flex min-h-10 items-center gap-2 rounded-[0.9rem] px-3 text-sm text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]"
                          onClick={() => setMenuOpen(false)}
                        >
                          <Settings className="size-4 text-[var(--color-text-muted)]" />
                          {t("common.settings")}
                        </Link>
                        <div className="my-1 border-t border-[var(--color-divider)]" />
                        <button
                          type="button"
                          className="flex min-h-10 w-full items-center gap-2 rounded-[0.9rem] px-3 text-left text-sm text-[var(--color-danger)] transition hover:bg-red-50"
                          onClick={() => {
                            setMenuOpen(false);
                            void logout();
                          }}
                        >
                          <LogOut className="size-4" />
                          {t("common.logout")}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </header>

          {headerVariant === "default" ? (
            <section className="mb-5 mt-5 flex flex-col gap-2 sm:mb-6 sm:mt-6 sm:gap-3 md:flex-row md:items-end md:justify-between px-1">
              <div className="min-w-0">
                <h1 className="mt-1 text-[1.85rem] font-bold tracking-[-0.05em] text-[var(--color-heading)] sm:text-[2.2rem] md:text-[2.4rem]">{title}</h1>
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

      {hideBottomNav ? null : <BottomNav />}
    </div>
  );
}

export function Example() {
  const { t } = useLanguage();
  return (
    <DashboardWithCollapsibleSidebar title={t("shell.demo_title")} subtitle={t("shell.demo_subtitle")}>
      <div className="surface-card rounded-[1.5rem] px-5 py-8 text-sm text-[var(--color-text-muted)]">{t("shell.demo_body")}</div>
    </DashboardWithCollapsibleSidebar>
  );
}

export default DashboardWithCollapsibleSidebar;
