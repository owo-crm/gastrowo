import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, Lock, Clock3, Coins, CreditCard, FilePlus2, LogOut, MoreHorizontal, Settings, Trash2, X, XCircle } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadBusinessLogo } from "@/lib/business-branding";
import { formatRelativeTimestamp } from "@/lib/date";
import { type Lang, useLanguage } from "@/lib/i18n";
import { NAV_GROUP_ORDER, getHomeRoute, getNavItems, type NavItem } from "@/lib/navigation";
import type { NotificationItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const MOBILE_PRIMARY_COUNT = 4;

function notificationPresentation(item: NotificationItem) {
  if (item.type === "billing") return { Icon: CreditCard, className: "bg-amber-50 text-amber-700" };
  if (item.type === "report") return { Icon: Coins, className: "bg-amber-50 text-amber-700" };
  if (item.type === "timesheet") return { Icon: Clock3, className: "bg-sky-50 text-sky-700" };
  if (item.type === "task") return { Icon: FilePlus2, className: "bg-indigo-50 text-indigo-700" };
  const normalized = item.title.toLowerCase();
  if (normalized.includes("completed") || normalized.includes("approved") || normalized.includes("accepted")) {
    return { Icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700" };
  }
  if (normalized.includes("rejected") || normalized.includes("deleted")) return { Icon: XCircle, className: "bg-red-50 text-red-600" };
  return { Icon: Bell, className: "bg-[var(--color-accent)] text-[var(--color-primary)]" };
}

function initialsOf(name: string | null | undefined, fallback: string): string {
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase() ?? "")
    .join("");
  return initials || fallback;
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function NotificationsButton() {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.listNotifications(token!, 20),
    enabled: Boolean(token),
    refetchInterval: 60_000,
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.deleteNotification(token!, id), onSuccess: invalidate });
  const markReadMutation = useMutation({ mutationFn: (ids: string[]) => api.markNotificationsRead(token!, ids), onSuccess: invalidate });

  const items = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.unread_count ?? 0;
  const unreadIds = useMemo(() => items.filter((item) => !item.read_at).map((item) => item.id), [items]);

  useEffect(() => {
    if (open && unreadIds.length && !markReadMutation.isPending) markReadMutation.mutate(unreadIds);
  }, [open, unreadIds, markReadMutation]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative grid size-10 place-items-center rounded-xl text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]"
        aria-label={t("common.notifications")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="size-[1.15rem]" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold leading-4 text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="fixed inset-x-3 top-16 z-50 rounded-2xl border border-[var(--color-border)] bg-white p-2 shadow-[var(--shadow-float)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]">
          <p className="px-3 py-2 text-sm font-semibold text-[var(--color-heading)]">{t("common.notifications")}</p>
          <div className="max-h-[min(60dvh,420px)] space-y-1 overflow-y-auto">
            {items.map((item) => {
              const presentation = notificationPresentation(item);
              return (
                <div key={item.id} className={cn("group flex items-start gap-3 rounded-xl px-3 py-2.5", !item.read_at && "bg-[var(--color-accent)]/60")}>
                  <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", presentation.className)}>
                    <presentation.Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--color-heading)]">{item.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">{item.body}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                      {formatRelativeTimestamp(item.created_at, { todayLabel: t("common.today"), yesterdayLabel: t("common.yesterday"), locale: lang })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-1 text-[var(--color-text-muted)] opacity-60 transition hover:text-[var(--color-danger)] hover:opacity-100"
                    aria-label={t("shell.delete_notification")}
                    onClick={() => deleteMutation.mutate(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
            {!items.length ? <p className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">{t("common.no_notifications")}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LanguageSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();
  return (
    <div className={cn("flex items-center gap-1", className)} role="group" aria-label={t("shell.language")}>
      {(["pl", "en", "ru"] as Lang[]).map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={lang === item}
          onClick={() => setLang(item)}
          className={cn(
            "rounded-lg px-2 py-1 text-xs font-semibold uppercase transition",
            lang === item ? "bg-[var(--color-heading)] text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-heading)]",
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function UserMenu({ placement }: { placement: "sidebar" | "topbar" }) {
  const { me, logout } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const initials = initialsOf(me?.full_name, "U");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={t("shell.user_menu")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex items-center gap-3 rounded-xl text-left transition hover:bg-[var(--color-surface-muted)]",
          placement === "sidebar" ? "w-full px-2 py-2" : "p-1",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--color-accent)] text-xs font-bold text-[var(--color-primary)]">
          {me?.avatar_url ? <img src={me.avatar_url} alt="" className="size-full object-cover" /> : initials}
        </span>
        {placement === "sidebar" ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--color-heading)]">{me?.full_name}</span>
            <span className="block text-xs text-[var(--color-text-muted)]">{me?.role ? t(`shell.role.${me.role}`) : ""}</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className={cn(
            "absolute z-50 min-w-[220px] rounded-2xl border border-[var(--color-border)] bg-white p-2 shadow-[var(--shadow-float)]",
            placement === "sidebar" ? "bottom-14 left-0" : "right-0 top-12",
          )}
        >
          <Link to="/profile" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]">
            <Settings className="size-4 text-[var(--color-text-muted)]" />
            {t("common.settings")}
          </Link>
          <div className="px-3 py-2">
            <LanguageSwitch />
          </div>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-[var(--color-danger)] hover:bg-red-50"
          >
            <LogOut className="size-4" />
            {t("common.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const { t } = useLanguage();
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          "flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
          isActive && !item.locked
            ? "bg-[var(--color-accent)] font-semibold text-[var(--color-primary)]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]",
        )
      }
    >
      <item.icon className="size-[1.1rem] shrink-0" aria-hidden />
      <span>{t(`nav.${item.key}`)}</span>
      {item.locked ? <Lock className="ml-auto size-3.5 shrink-0" aria-label={t("nav.locked")} /> : null}
    </NavLink>
  );
}

function WorkspaceBadge() {
  const { me } = useAuth();
  const { t } = useLanguage();
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    setLogo(loadBusinessLogo(me?.active_organization_id));
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ organizationId: string | null; logoUrl: string | null }>).detail;
      if ((detail?.organizationId ?? null) === (me?.active_organization_id ?? null)) setLogo(detail?.logoUrl ?? null);
    };
    window.addEventListener("business-branding-updated", onUpdate as EventListener);
    return () => window.removeEventListener("business-branding-updated", onUpdate as EventListener);
  }, [me?.active_organization_id]);
  const name = me?.active_organization_name ?? t("common.workspace");

  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-muted)] px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--color-primary)] text-xs font-bold text-white">
        {logo ? <img src={logo} alt="" className="size-full object-cover" /> : initialsOf(name, "GW")}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-[var(--color-heading)]">{name}</span>
    </div>
  );
}

function MobileNav({ items }: { items: NavItem[] }) {
  const { t } = useLanguage();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = items.length > MOBILE_PRIMARY_COUNT + 1 ? items.slice(0, MOBILE_PRIMARY_COUNT) : items;
  const secondary = items.length > MOBILE_PRIMARY_COUNT + 1 ? items.slice(MOBILE_PRIMARY_COUNT) : [];
  const moreActive = secondary.some((item) => !item.locked && location.pathname.startsWith(item.to)) || location.pathname.startsWith("/profile");

  useEffect(() => setMoreOpen(false), [location.pathname]);

  const tabClass = (active: boolean) =>
    cn(
      "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition",
      active ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]",
    );

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-[110] bg-slate-900/30 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] shadow-[var(--shadow-float)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--color-heading)]">{t("nav.more")}</p>
              <button type="button" className="rounded-lg p-2 text-[var(--color-text-muted)]" aria-label="Close" onClick={() => setMoreOpen(false)}>
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-1">
              {secondary.map((item) => (
                <SidebarLink key={item.key} item={item} />
              ))}
              <SidebarLink item={{ to: "/profile", key: "profile", icon: Settings, group: "manage" }} />
            </div>
            <div className="mt-3 border-t border-[var(--color-border)] pt-3">
              <LanguageSwitch />
            </div>
          </div>
        </div>
      ) : null}
      <nav className="fixed inset-x-0 bottom-0 z-[120] border-t border-[var(--color-border)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Menu">
        <ul className="mx-auto flex max-w-lg">
          {primary.map((item) => (
            <li key={item.key} className="flex flex-1">
              <NavLink to={item.to} className={({ isActive }) => tabClass(isActive && !item.locked)}>
                <item.icon className="size-5" aria-hidden />
                <span className="truncate">{t(`nav.${item.key}`)}</span>
              </NavLink>
            </li>
          ))}
          <li className="flex flex-1">
            <button type="button" className={tabClass(moreActive || moreOpen)} aria-expanded={moreOpen} onClick={() => setMoreOpen((current) => !current)}>
              <MoreHorizontal className="size-5" aria-hidden />
              <span>{t("nav.more")}</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

export function AppShell({
  children,
  title,
  subtitle,
  action,
  hideBottomNav,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Kept for existing callers; every page now gets the same header. */
  headerVariant?: "default" | "minimal";
  restaurantName?: string;
  hideBottomNav?: boolean;
}) {
  const { me } = useAuth();
  const { t } = useLanguage();
  const items = getNavItems(me);

  return (
    <div className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[var(--color-border)] bg-white px-3 py-4 lg:flex">
        <Link to={getHomeRoute(me)} className="px-3 pb-4" aria-label="Gastrostuff">
          <BrandLogo kind="wordmark" className="text-[2.1rem]" />
        </Link>
        <WorkspaceBadge />
        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto" aria-label="Menu">
          {NAV_GROUP_ORDER.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (!groupItems.length) return null;
            return (
              <div key={group}>
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t(`nav.group.${group}`)}</p>
                <div className="space-y-0.5">
                  {groupItems.map((item) => (
                    <SidebarLink key={item.key} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-[var(--color-border)] pt-3">
          <UserMenu placement="sidebar" />
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-white/90 backdrop-blur">
          <div className="mx-auto flex min-h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Link to={getHomeRoute(me)} className="lg:hidden" aria-label="Gastrostuff">
              <BrandLogo kind="mark" className="text-[1.9rem]" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold tracking-tight text-[var(--color-heading)] sm:text-xl">{title}</h1>
              {subtitle ? <p className="hidden truncate text-sm text-[var(--color-text-muted)] sm:block">{subtitle}</p> : null}
            </div>
            {action ? <div className="hidden shrink-0 md:block">{action}</div> : null}
            <NotificationsButton />
            <div className="lg:hidden">
              <UserMenu placement="topbar" />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1280px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
          {action ? <div className="mb-4 md:hidden">{action}</div> : null}
          {children}
        </main>
      </div>

      {hideBottomNav ? null : <MobileNav items={items} />}
    </div>
  );
}
