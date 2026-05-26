import { NavLink } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { getNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { me } = useAuth();
  const { t } = useLanguage();
  const navItems = getNavItems(me);

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex justify-center px-4 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="glass-surface glass-halo pointer-events-auto grid w-full max-w-[28rem] grid-flow-col auto-cols-fr items-center gap-1.5 rounded-[1.65rem] px-2 py-2 shadow-[0_20px_50px_rgba(15,23,42,0.15)]">
        {navItems.map((item) => (
          <li key={item.to} className="min-w-0">
            <NavLink
              aria-label={t(`nav.${item.key}`)}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex h-[44px] w-full items-center justify-center rounded-full transition-all duration-300 ease-out active:scale-95",
                  isActive
                    ? "bg-[var(--color-primary)] text-white shadow-[0_8px_20px_hsla(var(--color-primary-hsl),0.35)] scale-[1.05]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]",
                )
              }
            >
              <item.icon className="size-[1.1rem]" aria-hidden />
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
