import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCircle2, ChevronRight, Clock3, Coins, CreditCard, FilePlus2, Lock, LogOut, Trash2, XCircle } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { CloseButton } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadBusinessLogo } from "@/lib/business-branding";
import { formatRelativeTimestamp } from "@/lib/date";
import { type Lang, useLanguage } from "@/lib/i18n";
import { findActive, getHomeRoute, getNavSections, type NavSection, type NavSub } from "@/lib/navigation";
import type { NotificationItem, NotificationListResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Settings-style colored tile per section. */
const SECTION_COLORS: Record<NavSection["key"], string> = {
  schedule: "#ff3b30",
  team: "#007aff",
  business: "#34c759",
  earnings: "#34c759",
  tasks: "#ff9500",
  settings: "#8e8e93",
};

function SectionTile({ section, size = 28 }: { section: NavSection; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[8px] text-white" style={{ backgroundColor: SECTION_COLORS[section.key], width: size, height: size }}>
      <section.icon className="size-[17px]" strokeWidth={2.4} aria-hidden />
    </span>
  );
}

function notificationPresentation(item: NotificationItem) {
  if (item.type === "billing") return { Icon: CreditCard, className: "bg-[var(--color-warning-fill)] text-[var(--color-warning)]" };
  if (item.type === "report") return { Icon: Coins, className: "bg-[var(--color-warning-fill)] text-[var(--color-warning)]" };
  if (item.type === "timesheet") return { Icon: Clock3, className: "bg-[var(--color-accent)] text-[var(--color-primary-strong)]" };
  if (item.type === "task") return { Icon: FilePlus2, className: "bg-[var(--color-accent)] text-[var(--color-primary-strong)]" };
  const normalized = item.title.toLowerCase();
  if (normalized.includes("completed") || normalized.includes("approved") || normalized.includes("accepted")) {
    return { Icon: CheckCircle2, className: "bg-[var(--color-success-fill)] text-[var(--color-success)]" };
  }
  if (normalized.includes("rejected") || normalized.includes("deleted")) return { Icon: XCircle, className: "bg-[var(--color-danger-fill)] text-[var(--color-danger)]" };
  return { Icon: Bell, className: "bg-[var(--color-accent)] text-[var(--color-primary-strong)]" };
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

/** One shared query for the bell, the Tasks dot and the Tasks page. */
export function useNotifications() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.listNotifications(token!, 20),
    enabled: Boolean(token),
    refetchInterval: 60_000,
  });
}

function useHasNewTasks() {
  const query = useNotifications();
  return (query.data?.items ?? []).some((item) => item.type === "task" && !item.read_at);
}

function NewDot({ className }: { className?: string }) {
  return <span className={cn("absolute size-2.5 rounded-full bg-[var(--color-danger)] ring-2 ring-white", className)} aria-hidden />;
}

function NotificationsButton() {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  const navigate = useNavigate();
  const notificationsQuery = useNotifications();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  // Deleting feels instant: the row goes away at once and comes back only if the server refuses.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteNotification(token!, id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = queryClient.getQueryData<NotificationListResponse>(["notifications"]);
      if (previous) {
        const removed = previous.items.find((item) => item.id === id);
        queryClient.setQueryData<NotificationListResponse>(["notifications"], {
          items: previous.items.filter((item) => item.id !== id),
          unread_count: Math.max(0, previous.unread_count - (removed && !removed.read_at ? 1 : 0)),
        });
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["notifications"], context.previous);
    },
    onSettled: invalidate,
  });
  const markReadMutation = useMutation({ mutationFn: (ids: string[]) => api.markNotificationsRead(token!, ids), onSuccess: invalidate });

  const items = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.unread_count ?? 0;
  // Task notices stay unread until the person opens Tasks, so the red dot there keeps pointing at new work.
  const unreadIds = useMemo(() => items.filter((item) => !item.read_at && item.type !== "task").map((item) => item.id), [items]);

  useEffect(() => {
    if (open && unreadIds.length && !markReadMutation.isPending) markReadMutation.mutate(unreadIds);
  }, [open, unreadIds, markReadMutation]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative grid size-11 place-items-center rounded-full bg-white text-black shadow-[0_1px_4px_rgba(0,0,0,0.08)] active:opacity-60"
        aria-label={t("common.notifications")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="size-[22px]" strokeWidth={2.2} />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[11px] font-semibold leading-[18px] text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="fixed inset-x-3 top-[calc(var(--nav-height)+8px)] z-50 overflow-hidden rounded-[24px] bg-white shadow-[var(--shadow-float)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-14 sm:w-[400px]">
          <div className="flex items-center justify-between border-b border-[var(--color-separator)] py-1 pl-4 pr-1">
            <p className="text-[17px] font-semibold text-black">{t("common.notifications")}</p>
            <CloseButton onClick={() => setOpen(false)} label={t("common.close")} />
          </div>
          <ul className="max-h-[min(65dvh,460px)] divide-y divide-[var(--color-separator)] overflow-y-auto">
            {items.map((item) => {
              const presentation = notificationPresentation(item);
              return (
                <li key={item.id} className={cn("flex items-start gap-3 px-4 py-3", !item.read_at && "bg-[var(--color-accent)]")}>
                  <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", presentation.className)}>
                    <presentation.Icon className="size-4" />
                  </span>
                  <div
                    className={cn("min-w-0 flex-1", item.action_url && "cursor-pointer")}
                    onClick={
                      item.action_url
                        ? () => {
                            setOpen(false);
                            navigate(item.action_url!);
                          }
                        : undefined
                    }
                  >
                    <p className="text-[15px] font-semibold text-black">{item.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[14px] leading-5 text-[var(--color-text-muted)]">{item.body}</p>
                    <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                      {formatRelativeTimestamp(item.created_at, { todayLabel: t("common.today"), yesterdayLabel: t("common.yesterday"), locale: lang })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="grid size-9 shrink-0 place-items-center rounded-full text-[#3c3c43] hover:bg-[var(--color-danger-fill)] hover:text-[var(--color-danger)]"
                    aria-label={t("shell.delete_notification")}
                    onClick={() => deleteMutation.mutate(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
            {!items.length ? <li className="px-4 py-10 text-center text-[15px] text-[var(--color-text-muted)]">{t("common.no_notifications")}</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const LANGS: Array<{ value: Lang; label: string }> = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "ru", label: "Русский" },
];

/** Language choice as an iOS checkmark list. */
export function LanguageList({ className }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();
  return (
    <div className={className} role="group" aria-label={t("shell.language")}>
      {LANGS.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={lang === item.value}
          onClick={() => setLang(item.value)}
          className="flex min-h-11 w-full items-center justify-between rounded-[8px] px-3 text-left text-[15px] text-black hover:bg-[var(--color-fill)]"
        >
          {item.label}
          {lang === item.value ? <Check className="size-4 text-[var(--color-primary-strong)]" strokeWidth={3} /> : null}
        </button>
      ))}
    </div>
  );
}

function UserRow() {
  const { me, logout } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      {open ? (
        <div className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-50 rounded-[20px] bg-white p-1.5 shadow-[var(--shadow-float)]">
          <p className="ios-section-header px-3 pb-1 pt-1.5">{t("shell.language")}</p>
          <LanguageList />
          <div className="my-1 border-t border-[var(--color-separator)]" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-[8px] px-3 text-left text-[15px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-fill)]"
          >
            <LogOut className="size-4" />
            {t("shell.log_out")}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-label={t("shell.user_menu")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white/60"
      >
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--color-primary-strong)] text-[13px] font-semibold text-white">
          {me?.avatar_url ? <img src={me.avatar_url} alt="" className="size-full object-cover" /> : initialsOf(me?.full_name, "U")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-black">{me?.full_name}</span>
          <span className="block text-[13px] text-[var(--color-text-muted)]">{me?.role ? t(`shell.role.${me.role}`) : ""}</span>
        </span>
        <ChevronRight className={cn("size-4 shrink-0 text-[#3c3c43] transition", open && "-rotate-90")} />
      </button>
    </div>
  );
}

function WorkspaceHeader() {
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
    <Link to={getHomeRoute(me)} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/60">
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[var(--color-primary-strong)] text-[13px] font-semibold text-white">
        {logo ? <img src={logo} alt="" className="size-full object-cover" /> : initialsOf(name, "GS")}
      </span>
      <span className="min-w-0 truncate text-[17px] font-semibold text-black">{name}</span>
    </Link>
  );
}

function SubLink({ item }: { item: NavSub }) {
  const { t } = useLanguage();
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex min-h-10 items-center gap-2 rounded-xl py-1.5 pl-[50px] pr-3 text-[15px] transition",
          isActive && !item.locked ? "bg-[var(--color-primary-strong)] font-semibold text-white shadow-[0_4px_12px_rgba(31,91,214,0.3)]" : "text-black hover:bg-white/60",
        )
      }
    >
      <span className="min-w-0 flex-1 truncate">{t(`sub.${item.key}`)}</span>
      {item.locked ? <Lock className="size-3.5 shrink-0 text-[#3c3c43]" aria-label={t("nav.locked")} /> : null}
    </NavLink>
  );
}

function SidebarSection({ section, active }: { section: NavSection; active: boolean }) {
  const { t } = useLanguage();
  const hasNewTasks = useHasNewTasks();
  const dot = section.key === "tasks" && hasNewTasks;
  const single = section.subs.length === 1;
  const first = section.subs[0];

  if (single) {
    return (
      <NavLink
        to={first.to}
        className={({ isActive }) =>
          cn(
            "flex min-h-11 items-center gap-3 rounded-2xl px-2.5 text-[16px] font-semibold transition",
            isActive && !first.locked ? "bg-white text-black shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-black hover:bg-white/60",
          )
        }
      >
        <SectionTile section={section} />
        <span className="flex-1">{t(`section.${section.key}`)}</span>
        {dot ? <span className="size-2.5 rounded-full bg-[var(--color-danger)]" aria-label={t("tasks.new_badge")} /> : null}
        {first.locked ? <Lock className="size-3.5 shrink-0 text-[#3c3c43]" /> : null}
      </NavLink>
    );
  }

  return (
    <div>
      <Link
        to={section.subs.find((item) => !item.locked)?.to ?? first.to}
        aria-expanded={active}
        className="flex min-h-11 items-center gap-3 rounded-2xl px-2.5 text-[16px] font-semibold text-black hover:bg-white/60"
      >
        <SectionTile section={section} />
        <span className="flex-1">{t(`section.${section.key}`)}</span>
        <ChevronRight className={cn("size-4 text-[#3c3c43] transition", active && "rotate-90")} aria-hidden />
      </Link>
      {active ? (
        <div className="mt-0.5 space-y-0.5">
          {section.subs.map((item) => (
            <SubLink key={item.key} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Always visible in the public demo: what this is, and the way out to a real account. */
function DemoBanner() {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-[#1c1c1e] px-4 py-2 text-[14px] text-white sm:px-6" role="note">
      <span className="rounded-full bg-[var(--color-warning)] px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-black">{t("demo.badge")}</span>
      <span className="min-w-0 flex-1 max-sm:hidden">{t("demo.banner")}</span>
      <span className="min-w-0 flex-1 sm:hidden">{t("demo.banner_short")}</span>
      <button
        type="button"
        onClick={async () => {
          await logout();
          navigate("/login?mode=onboarding");
        }}
        className="inline-flex min-h-8 shrink-0 items-center rounded-full bg-white px-3.5 text-[14px] font-semibold text-black"
      >
        {t("demo.create_account")}
      </button>
    </div>
  );
}

/** Sub-tabs of the current section on phones: a scrollable row of pills under the title. */
function MobileSubTabs({ section }: { section: NavSection }) {
  const { t } = useLanguage();
  if (section.subs.length < 2) return null;
  return (
    <nav aria-label={t(`section.${section.key}`)} className="flex gap-2 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] lg:hidden">
      {section.subs.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-full px-3.5 text-[14px] font-semibold transition",
              isActive && !item.locked ? "bg-black text-white" : "bg-white text-black shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
            )
          }
        >
          {t(`sub.${item.key}`)}
          {item.locked ? <Lock className="size-3" /> : null}
        </NavLink>
      ))}
    </nav>
  );
}

function TabBar({ sections, activeKey }: { sections: NavSection[]; activeKey?: string }) {
  const { t } = useLanguage();
  const hasNewTasks = useHasNewTasks();
  return (
    <nav
      className="ios-glass fixed inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-[120] rounded-full p-1 lg:hidden"
      aria-label={t("shell.open_menu")}
    >
      <ul className="mx-auto flex max-w-xl">
        {sections.map((section) => {
          const target = section.subs.find((item) => !item.locked) ?? section.subs[0];
          const active = section.key === activeKey;
          return (
            <li key={section.key} className="flex flex-1">
              <Link
                to={target.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold",
                  active ? "bg-[rgba(0,122,255,0.12)] text-[var(--color-primary-strong)]" : "text-black",
                )}
              >
                <span className="relative">
                  <section.icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
                  {section.key === "tasks" && hasNewTasks ? <NewDot className="-right-1 -top-0.5" /> : null}
                </span>
                <span className="truncate">{t(`section.${section.key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({
  children,
  title,
  subtitle,
  action,
  fullBleed = false,
  flush = false,
  hideBottomNav,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Content fills the whole area without page padding (the schedule calendar). */
  fullBleed?: boolean;
  /** Edge-to-edge lists inside the normal content width (no page padding). */
  flush?: boolean;
  /** Kept for existing callers. */
  headerVariant?: "default" | "minimal";
  restaurantName?: string;
  hideBottomNav?: boolean;
}) {
  const { me } = useAuth();
  const location = useLocation();
  const sections = getNavSections(me);
  const active = findActive(sections, location.pathname);

  return (
    <div className="min-h-dvh bg-[var(--color-bg)] text-black">
      <aside className="ios-glass fixed bottom-3 left-3 top-3 z-40 hidden w-[256px] flex-col rounded-[28px] px-2.5 pb-2.5 pt-3 lg:flex">
        <WorkspaceHeader />
        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto" aria-label="Menu">
          {sections.map((section) => (
            <SidebarSection key={section.key} section={section} active={active?.section.key === section.key} />
          ))}
        </nav>
        <div className="pt-2">
          <UserRow />
        </div>
      </aside>

      <div className="lg:pl-[272px]">
        {me?.is_sandbox ? <DemoBanner /> : null}
        <header className="ios-bar sticky top-0 z-30">
          <div className={cn("flex min-h-[var(--nav-height)] items-center gap-2 pl-4 pr-2 pt-1 sm:pl-6", !fullBleed && "mx-auto max-w-[1180px]")}>
            <div className="min-w-0 flex-1 py-2">
              <h1 className="truncate text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-black lg:text-[30px]">{title}</h1>
              {subtitle ? <p className="hidden truncate text-[15px] text-[#3c3c43] md:block">{subtitle}</p> : null}
            </div>
            {action ? <div className="hidden shrink-0 md:block">{action}</div> : null}
            <NotificationsButton />
          </div>
          {active ? <MobileSubTabs section={active.section} /> : null}
        </header>

        <main
          className={cn(
            fullBleed
              ? "pb-[calc(env(safe-area-inset-bottom)+84px)] lg:pb-0"
              : flush
                ? "mx-auto max-w-[1180px] pb-32 pt-2 lg:pb-12"
                : "mx-auto max-w-[1180px] px-4 pb-32 pt-2 sm:px-6 lg:pb-12",
          )}
        >
          {action ? <div className={cn("md:hidden", fullBleed || flush ? "px-4 pb-3" : "mb-4")}>{action}</div> : null}
          {children}
        </main>
      </div>

      {hideBottomNav ? null : <TabBar sections={sections} activeKey={active?.section.key} />}
    </div>
  );
}
