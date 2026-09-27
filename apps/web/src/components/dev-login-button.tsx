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

export function DevLoginButton({ className }: { className?: string }) {
  const { devLogin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [isPending, setIsPending] = useState(false);
  const [visible, setVisible] = useState(isDevLoginAvailable);

  if (!visible) return null;

  const handleClick = async () => {
    setIsPending(true);
    try {
      await devLogin(readStoredKey());
      navigate("/", { replace: true });
    } catch (error) {
      // A rotated or wrong key: stop showing the button in this browser.
      if (!BUILD_ENABLED) {
        forgetTestKey();
        setVisible(false);
      }
      toast.error("Test login failed", error instanceof Error ? error.message : undefined);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-xl border border-dashed border-amber-400 bg-amber-50 px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60",
        className,
      )}
    >
      <FlaskConical className="size-4" />
      {isPending ? "Logowanie..." : "Wejdź jako admin (test)"}
    </button>
  );
}
