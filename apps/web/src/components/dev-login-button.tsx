import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const TEST_KEY_STORAGE = "gastrowo_test_login_key";

/** Test builds (VITE_DEV_LOGIN=true) always show the button; the API still has to allow it. */
const BUILD_ENABLED = import.meta.env.VITE_DEV_LOGIN === "true";

function readStoredKey(): string | null {
  try {
    return localStorage.getItem(TEST_KEY_STORAGE);
  } catch {
    return null;
  }
}

/**
 * Opening /?test=<DEV_LOGIN_SECRET> once remembers the key in this browser and strips it from the
 * address bar, so it does not linger in history or get shared with a copied link.
 */
export function captureTestLoginKey(): void {
  const url = new URL(window.location.href);
  const key = url.searchParams.get("test");
  if (!key) return;
  try {
    localStorage.setItem(TEST_KEY_STORAGE, key);
  } catch {
    // Private mode: the button just won't appear.
  }
  url.searchParams.delete("test");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function forgetTestKey(): void {
  try {
    localStorage.removeItem(TEST_KEY_STORAGE);
  } catch {
    // ignore
  }
}

export function isDevLoginAvailable(): boolean {
  return BUILD_ENABLED || Boolean(readStoredKey());
}

type TestRole = "admin" | "staff";

/** Two test sign-ins behind the remembered key: the owner's admin, or a worker of the same demo business. */
export function DevLoginButton({ className }: { className?: string }) {
  const { devLogin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState<TestRole | null>(null);
  const [visible, setVisible] = useState(isDevLoginAvailable);

  if (!visible) return null;

  const signIn = async (role: TestRole) => {
    setPending(role);
    try {
      await devLogin(readStoredKey(), role);
      navigate("/", { replace: true });
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      // A rotated or wrong key: stop showing the buttons in this browser. A missing worker is not a key problem.
      if (!BUILD_ENABLED && !(role === "staff" && status === 404 && error instanceof Error && /worker/i.test(error.message))) {
        forgetTestKey();
        setVisible(false);
      }
      toast.error("Test login failed", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(null);
    }
  };

  const chip =
    "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-amber-400 bg-amber-50 px-3 text-[14px] font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60";
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <button type="button" onClick={() => signIn("admin")} disabled={Boolean(pending)} className={chip}>
        <FlaskConical className="size-4" />
        {pending === "admin" ? "…" : "Test: admin"}
      </button>
      <button type="button" onClick={() => signIn("staff")} disabled={Boolean(pending)} className={chip}>
        <FlaskConical className="size-4" />
        {pending === "staff" ? "…" : "Test: worker"}
      </button>
    </div>
  );
}
