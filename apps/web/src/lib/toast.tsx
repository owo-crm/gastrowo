import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from "@/components/ui/alert-1";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

type ToastType = "success" | "info" | "warning" | "error";

type ToastItem = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  persist?: boolean;
};

type ToastInput = Omit<ToastItem, "id">;

type ToastContextValue = {
  show: (toast: ToastInput) => void;
  success: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const MAX_TOASTS = 4;

function iconFor(type: ToastType) {
  const Icon = type === "success" ? CircleCheck : type === "warning" ? TriangleAlert : type === "error" ? CircleAlert : Info;
  const className =
    type === "success"
      ? "bg-emerald-500 text-white"
      : type === "warning"
        ? "bg-amber-400 text-white"
        : type === "error"
          ? "bg-red-500 text-white"
          : "bg-blue-500 text-white";
  return (
    <span className={`grid size-10 shrink-0 place-items-center rounded-[0.9rem] ${className}`}>
      <Icon className="size-4.5" />
    </span>
  );
}

function variantFor(type: ToastType): "success" | "warning" | "destructive" | "info" {
  if (type === "success") return "success";
  if (type === "warning") return "warning";
  if (type === "error") return "destructive";
  return "info";
}

function toneClassFor(type: ToastType) {
  if (type === "success") return "border-emerald-200 bg-emerald-50 text-slate-950 shadow-[0_18px_42px_rgba(16,185,129,0.14)]";
  if (type === "warning") return "border-amber-200 bg-amber-50 text-slate-950 shadow-[0_18px_42px_rgba(245,158,11,0.14)]";
  if (type === "error") return "border-red-200 bg-red-50 text-slate-950 shadow-[0_18px_42px_rgba(239,68,68,0.14)]";
  return "border-blue-200 bg-blue-50 text-slate-950 shadow-[0_18px_42px_rgba(59,130,246,0.14)]";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      const id = crypto.randomUUID();
      const next: ToastItem = { id, ...toast };
      setToasts((current) => [...current, next].slice(-MAX_TOASTS));
      const shouldPersist = toast.persist ?? toast.type === "error";
      const duration = toast.duration ?? 4000;
      if (!shouldPersist) {
        window.setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      dismiss,
      success: (title, description) => show({ type: "success", title, description, duration: 2500 }),
      info: (title, description) => show({ type: "info", title, description, duration: 2500 }),
      warning: (title, description) => show({ type: "warning", title, description, duration: 2500 }),
      error: (title, description) => show({ type: "error", title, description, persist: true }),
    }),
    [dismiss, show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[150] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Alert
              close
              onClose={() => dismiss(toast.id)}
              appearance="light"
              variant={variantFor(toast.type)}
              className={`items-start gap-3 rounded-[1.25rem] border-2 px-4 py-3 ${toneClassFor(toast.type)} [&_[data-slot=alert-close]]:mt-0.5 [&_[data-slot=alert-close]]:ml-1 [&_[data-slot=alert-close]]:size-8 [&_[data-slot=alert-close]]:rounded-[0.8rem] [&_[data-slot=alert-close]]:bg-white/80 [&_[data-slot=alert-close]]:text-slate-500 [&_[data-slot=alert-close]]:hover:bg-white`}
            >
              <AlertIcon className="pt-0.5">{iconFor(toast.type)}</AlertIcon>
              <AlertContent className="min-w-0 flex-1 space-y-1.5 py-0.5">
                <AlertTitle className="text-sm font-semibold leading-[1.2] text-slate-900">{toast.title}</AlertTitle>
                {toast.description ? (
                  <AlertDescription className="text-xs leading-[1.5] text-slate-600 [&_p]:mb-0">
                    {toast.description}
                  </AlertDescription>
                ) : null}
              </AlertContent>
            </Alert>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
