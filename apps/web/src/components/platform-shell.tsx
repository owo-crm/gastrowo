import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { LogOut, ShieldCheck } from "lucide-react";
import { Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";

import { api, ApiError } from "@/lib/api";
import { usePlatformSession } from "@/lib/platform-session";
import { cn } from "@/lib/utils";

/** Admin pages open only with an admin session; without one, go to the admin sign-in. */
export function PlatformGuard({ children }: { children: JSX.Element }) {
  const { token } = usePlatformSession();
  const location = useLocation();
  if (!token) return <Navigate to={`/platform/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

const TABS = [
  { to: "/platform", label: "Businesses", end: true },
  { to: "/platform/support", label: "Support" },
];

/** The admin panel's own frame: no business navigation, a visible "admin" mark and a sign-out. */
export function PlatformShell({ title, subtitle, flush, children }: { title: string; subtitle?: string; flush?: boolean; children: ReactNode }) {
  const { token, email, signOut } = usePlatformSession();
  const navigate = useNavigate();

  // The server ends the session (an hour passed, signed out elsewhere): back to the sign-in.
  const check = useQuery({ queryKey: ["platform-me", token], queryFn: () => api.platformMe(token!), enabled: Boolean(token), refetchInterval: 60_000, retry: false });
  useEffect(() => {
    if (check.error instanceof ApiError && (check.error.status === 401 || check.error.status === 403)) signOut();
  }, [check.error, signOut]);

  const leave = async () => {
    if (token) await api.platformLogout(token).catch(() => undefined);
    signOut();
    navigate("/platform/login", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-[var(--color-bg)] text-black">
      <header className="sticky top-0 z-30 bg-[#0f172a] text-white">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[13px] font-semibold">
            <ShieldCheck className="size-4 text-[#ff7a2f]" aria-hidden /> Platofy Admin
          </span>
          <nav className="flex gap-1" aria-label="Admin">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) => cn("rounded-full px-3 py-1.5 text-[14px] font-semibold", isActive ? "bg-white text-black" : "text-white/75 hover:text-white")}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <span className="ml-auto hidden truncate text-[13px] text-white/60 sm:block">{email}</span>
          <button type="button" onClick={() => void leave()} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-semibold text-white/85 hover:bg-white/10" data-testid="platform-sign-out">
            <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>
      <main className={cn("mx-auto max-w-[1180px] pb-12 pt-5", !flush && "px-4 sm:px-6")}>
        <div className={cn("mb-4", flush && "px-4 sm:px-6")}>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
          {subtitle ? <p className="text-[15px] text-[var(--color-text-muted)]">{subtitle}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
