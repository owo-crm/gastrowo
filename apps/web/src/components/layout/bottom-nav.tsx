import { NavLink } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { getNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { me } = useAuth();
  const navItems = getNavItems(me);

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-3 z-[120] flex justify-center px-3 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="surface-elevated pointer-events-auto grid w-full max-w-[28rem] grid-flow-col auto-cols-fr items-center gap-1 rounded-[1.45rem] px-1.5 py-1.5">
        {navItems.map((item) => (
          <li key={item.to} className="min-w-0">
            <NavLink
              aria-label={item.key}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex h-11 w-full items-center justify-center rounded-full transition",
                  isActive
                    ? "bg-[var(--color-primary)] text-white shadow-[0_14px_28px_rgba(47,111,237,0.28)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]",
                )
              }
            >
              <item.icon className="size-[1rem]" aria-hidden />
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
