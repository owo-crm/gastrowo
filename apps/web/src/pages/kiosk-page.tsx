import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coffee, Delete, LogIn, LogOut } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import type { KioskPunchResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export const KIOSK_TOKEN_STORAGE = "gastrowo_kiosk_token";

export function readKioskToken(): string | null {
  try {
    return localStorage.getItem(KIOSK_TOKEN_STORAGE);
  } catch {
    return null;
  }
}

export function saveKioskToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KIOSK_TOKEN_STORAGE, token);
    else localStorage.removeItem(KIOSK_TOKEN_STORAGE);
  } catch {
    // Private mode: the tablet has to be set up again after a reload.
  }
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

/** Shared tablet at the restaurant: type your PIN, you're clocked in (or out). No sign-in needed. */
export function KioskPage() {
  const { t } = useLanguage();
  const [token] = useState(readKioskToken);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KioskPunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());

  const deviceQuery = useQuery({
    queryKey: ["kiosk-device", token],
    queryFn: () => api.kioskDevice(token!),
    enabled: Boolean(token),
    refetchInterval: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // The greeting clears itself so the next person sees an empty keypad.
  useEffect(() => {
    if (!result && !error) return;
    const timer = window.setTimeout(() => {
      setResult(null);
      setError(null);
    }, result ? 4000 : 2500);
    return () => window.clearTimeout(timer);
  }, [result, error]);

  const submit = async (value: string, action: "toggle" | "break" = "toggle") => {
    if (!token || busy) return;
    setBusy(true);
    try {
      setResult(await api.kioskPunch(token, value, action));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error && caught.message !== "Unknown PIN" ? caught.message : t("kiosk.wrong_pin"));
    } finally {
      setPin("");
      setBusy(false);
    }
  };

  const press = (key: (typeof KEYS)[number]) => {
    setError(null);
    if (key === "del") return setPin((current) => current.slice(0, -1));
    if (!key || pin.length >= 6) return;
    setPin((current) => current + key);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press(event.key as (typeof KEYS)[number]);
      else if (event.key === "Backspace") press("del");
      else if (event.key === "Enter" && pin.length >= 4) void submit(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!token || deviceQuery.isError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--color-bg)] px-6 text-center">
        <div className="max-w-sm">
          <p className="text-[22px] font-semibold text-black">{t("kiosk.not_set_up")}</p>
          <p className="mt-2 text-[16px] text-[var(--color-text-muted)]">{t("kiosk.not_set_up_body")}</p>
          <Link to="/settings/business" className="mt-6 inline-block text-[17px] font-semibold text-[var(--color-primary-strong)]">
            {t("kiosk.open_settings")}
          </Link>
        </div>
      </main>
    );
  }

  const device = deviceQuery.data;
  const dots = Array.from({ length: Math.max(4, pin.length) }, (_, index) => index < pin.length);

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--color-bg)] px-6 py-8">
      <header className="text-center">
        <p className="text-[15px] font-semibold text-[var(--color-text-muted)]">
          {device ? `${device.business_name} · ${device.location_name}` : " "}
        </p>
        <p className="mt-1 text-[64px] font-semibold leading-none tracking-tight tabular-nums text-black">
          {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
        <p className="mt-1 text-[17px] text-[var(--color-text-muted)]">{clock.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
      </header>

      <section className="mx-auto mt-8 flex w-full max-w-[360px] flex-1 flex-col items-center">
        {result ? (
          <div className="mt-6 flex flex-col items-center text-center" role="status">
            <span
              className={cn(
                "grid size-24 place-items-center rounded-full text-white",
                result.action === "in" || result.action === "break_end"
                  ? "bg-[var(--color-success)]"
                  : result.action === "break_start"
                    ? "bg-[var(--color-warning)]"
                    : "bg-[var(--color-primary-strong)]",
              )}
            >
              {result.action === "in" || result.action === "break_end" ? (
                <LogIn className="size-11" />
              ) : result.action === "break_start" ? (
                <Coffee className="size-11" />
              ) : (
                <LogOut className="size-11" />
              )}
            </span>
            <p className="mt-5 text-[28px] font-semibold text-black">
              {t(`kiosk.title_${result.action}`, { name: result.full_name.split(" ")[0] })}
            </p>
            <p className="mt-1 text-[18px] text-[var(--color-text-muted)]">
              {result.action === "in"
                ? result.session.shift
                  ? t("kiosk.in_with_shift", { start: result.session.shift.start_time, end: result.session.shift.end_time })
                  : t("kiosk.in_no_shift")
                : result.action === "out"
                  ? t("kiosk.out_hours", { hours: (result.hours ?? 0).toFixed(1) })
                  : result.action === "break_start"
                    ? t("kiosk.break_start_body")
                    : t("kiosk.break_end_body")}
            </p>
          </div>
        ) : (
          <>
            <p className="text-[20px] font-semibold text-black">{device?.enabled === false ? t("kiosk.disabled") : t("kiosk.enter_pin")}</p>
            <div className="mt-4 flex h-6 items-center gap-3" aria-label={t("kiosk.enter_pin")}>
              {dots.map((filled, index) => (
                <span key={index} className={cn("size-4 rounded-full border-2 border-black", filled && "bg-black")} />
              ))}
            </div>
            <p className={cn("mt-3 h-6 text-[16px] font-semibold text-[var(--color-danger)]", !error && "invisible")} role="alert">
              {error ?? "."}
            </p>
            <div className="mt-4 grid w-full grid-cols-3 gap-4">
              {KEYS.map((key, index) =>
                key === "" ? (
                  <span key={index} />
                ) : (
                  <button
                    key={index}
                    type="button"
                    onClick={() => press(key)}
                    aria-label={key === "del" ? t("kiosk.delete") : key}
                    className="grid aspect-square place-items-center rounded-full bg-white text-[32px] font-semibold text-black shadow-[0_1px_3px_rgba(0,0,0,0.08)] active:bg-[var(--color-fill)]"
                  >
                    {key === "del" ? <Delete className="size-7" /> : key}
                  </button>
                ),
              )}
            </div>
            <div className="mt-6 flex w-full gap-3">
              <button
                type="button"
                onClick={() => void submit(pin, "break")}
                disabled={pin.length < 4 || busy || device?.enabled === false}
                className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-white text-[18px] font-semibold text-black shadow-[0_1px_3px_rgba(0,0,0,0.08)] disabled:opacity-40"
              >
                <Coffee className="size-5" /> {t("kiosk.break")}
              </button>
              <button
                type="button"
                onClick={() => void submit(pin)}
                disabled={pin.length < 4 || busy || device?.enabled === false}
                className="min-h-14 flex-[2] rounded-full bg-[var(--color-primary-strong)] text-[18px] font-semibold text-white disabled:opacity-40"
              >
                {t("kiosk.go")}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
