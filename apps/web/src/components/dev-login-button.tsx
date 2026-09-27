import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Build-time switch: only test builds get the button. The API independently requires DEV_LOGIN_ENABLED. */
export const DEV_LOGIN_AVAILABLE = import.meta.env.VITE_DEV_LOGIN === "true";

export function DevLoginButton({ className }: { className?: string }) {
  const { devLogin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [isPending, setIsPending] = useState(false);

  if (!DEV_LOGIN_AVAILABLE) return null;

  const handleClick = async () => {
    setIsPending(true);
    try {
      await devLogin();
      navigate("/", { replace: true });
    } catch (error) {
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
