import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coffee, Delete, LogIn, LogOut, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "@/lib/api";
import { localeFor } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import type { KioskLookup, KioskPunchResult } from "@/lib/types";
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
/** A person's screen closes by itself after this long without a tap, so the next person can't end their shift. */
const IDLE_MS = 60_000;
/** How long the confirmation after Start / End / Break stays up. */
const DONE_MS = 1500;
// Everything scales with the screen height, so the whole screen fits on any tablet without scrolling.
const KEY_SIZE: CSSProperties = { width: "min(10.5vh, 84px)", height: "min(10.5vh, 84px)" };

type Stage = "keypad" | "person" | "done";
type Person = KioskLookup & { pin: string; offsetMs: number };

function hms(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

/** Shared tablet at the restaurant: type your PIN to open your own screen, then start or end the shift there. */
export function KioskPage() {
  const { t, lang } = useLanguage();
  const locale = localeFor(lang);
  const navigate = useNavigate();
  const [token] = useState(readKioskToken);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [stage, setStage] = useState<Stage>("keypad");
  const [person, setPerson] = useState<Person | null>(null);
  const [done, setDone] = useState<{ result: KioskPunchResult; at: Date } | null>(null);
  // "exit": the keypad takes a manager's PIN to leave the time clock.
  const [mode, setMode] = useState<"punch" | "exit">("punch");
  const lastActivity = useRef(Date.now());

  const deviceQuery = useQuery({
    queryKey: ["kiosk-device", token],
    queryFn: () => api.kioskDevice(token!),
    enabled: Boolean(token),
    refetchInterval: 5 * 60_000,
    retry: false,
  });

  const backToKeypad = () => {
    setStage("keypad");
    setPerson(null);
    setDone(null);
    setPin("");
    setError(null);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
      if (stage === "person" && Date.now() - lastActivity.current > IDLE_MS) backToKeypad();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, []);

  // The confirmation after an action clears itself so the next person sees an empty keypad.
  useEffect(() => {
    if (stage !== "done") return;
    const timer = window.setTimeout(backToKeypad, DONE_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // A wrong PIN message fades after a moment.
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 2500);
    return () => window.clearTimeout(timer);
  }, [error]);

  const time = (date: Date) => date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const shortTime = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  };

  const openPerson = async (value: string) => {
    if (!token || busy) return;
    setBusy(true);
    try {
      if (mode === "exit") {
        await api.kioskExit(token, value);
        navigate("/overview");
        return;
      }
      const found = await api.kioskLookup(token, value);
      setPerson({ ...found, pin: value, offsetMs: new Date(found.server_now).getTime() - Date.now() });
      lastActivity.current = Date.now();
      setStage("person");
    } catch (caught) {
      setError(caught instanceof Error && caught.message !== "Unknown PIN" ? caught.message : t("kiosk.wrong_pin"));
    } finally {
      setPin("");
      setBusy(false);
    }
  };

  const act = async (action: "in" | "out" | "break") => {
    if (!token || !person || busy) return;
    setBusy(true);
    try {
      const result = await api.kioskPunch(token, person.pin, action);
      setDone({ result, at: new Date() });
      setStage("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("kiosk.wrong_pin"));
    } finally {
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
      if (stage !== "keypad") return;
      if (/^\d$/.test(event.key)) press(event.key as (typeof KEYS)[number]);
      else if (event.key === "Backspace") press("del");
      else if (event.key === "Enter" && pin.length >= 4) void openPerson(pin);
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
  const session = person?.open_session ?? null;
  const serverNow = now.getTime() + (person?.offsetMs ?? 0);
  const workedSeconds = session
    ? (serverNow - new Date(session.clock_in_at).getTime()) / 1000 -
      session.break_seconds -
      (session.on_break && session.break_started_at ? (serverNow - new Date(session.break_started_at).getTime()) / 1000 : 0)
    : 0;
  const shift = session?.shift ?? person?.shift ?? null;

  const clockPanel = (
    <header className="flex flex-col items-center justify-center text-center">
      <p className="text-[15px] font-semibold text-[var(--color-text-muted)]">{device ? `${device.business_name} · ${device.location_name}` : " "}</p>
      <p className="mt-1 whitespace-nowrap font-semibold leading-none tracking-tight tabular-nums text-black" style={{ fontSize: "clamp(32px, min(8vh, 12vw), 72px)" }}>
        {time(now)}
      </p>
      <p className="mt-1 text-[17px] text-[var(--color-text-muted)]">{now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}</p>
    </header>
  );

  return (
    <main className="relative flex h-dvh flex-col gap-[3vh] overflow-hidden bg-[var(--color-bg)] px-6 py-[3vh] max-sm:portrait:pt-16 landscape:flex-row landscape:items-center landscape:justify-center landscape:gap-[6vw]">
      {stage === "keypad" ? (
        <button
          type="button"
          onClick={() => {
            setMode(mode === "exit" ? "punch" : "exit");
            setPin("");
            setError(null);
          }}
          className="absolute right-4 top-4 z-10 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[15px] font-semibold text-[#3c3c43] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
        >
          {mode === "exit" ? (
            <>
              <X className="size-4" /> {t("common.cancel")}
            </>
          ) : (
            <>
              <LogOut className="size-4" /> {t("kiosk.exit")}
            </>
          )}
        </button>
      ) : null}

      <div className="landscape:w-[40%]">{clockPanel}</div>

      <section className="mx-auto flex min-h-0 w-full max-w-[380px] flex-1 flex-col items-center justify-center landscape:mx-0 landscape:flex-none">
        {stage === "done" && done ? (
          <div className="flex flex-col items-center text-center" role="status">
            <span
              className={cn(
                "grid size-20 place-items-center rounded-full text-white",
                done.result.action === "in" || done.result.action === "break_end"
                  ? "bg-[var(--color-success)]"
                  : done.result.action === "break_start"
                    ? "bg-[var(--color-warning)]"
                    : "bg-[var(--color-primary-strong)]",
              )}
            >
              {done.result.action === "break_start" ? <Coffee className="size-10" /> : done.result.action === "out" ? <LogOut className="size-10" /> : <LogIn className="size-10" />}
            </span>
            <p className="mt-4 text-[26px] font-semibold text-black">{t(`kiosk.title_${done.result.action}`, { name: done.result.full_name.split(" ")[0] })}</p>
            <p className="mt-1 text-[34px] font-semibold tabular-nums text-black">{time(done.at)}</p>
            {done.result.action === "out" ? (
              <p className="mt-1 text-[18px] text-[var(--color-text-muted)]">{t("kiosk.out_hours", { hours: (done.result.hours ?? 0).toFixed(1) })}</p>
            ) : null}
          </div>
        ) : stage === "person" && person ? (
          <div className="flex w-full flex-col items-center text-center">
            <p className="text-[28px] font-semibold text-black">{person.full_name}</p>
            <p className="mt-1 text-[17px] text-[var(--color-text-muted)]">
              {shift
                ? t("kiosk.scheduled", { start: shortTime(shift.start_time), end: shortTime(shift.end_time) }) + (shift.staff_position ? ` · ${shift.staff_position}` : "")
                : t("kiosk.no_shift_today")}
            </p>
            {session ? (
              <div className="mt-[3vh] w-full rounded-[20px] bg-white px-5 py-4">
                <p className="text-[15px] text-[var(--color-text-muted)]">{t("kiosk.started_at", { time: time(new Date(session.clock_in_at)) })}</p>
                <p className="mt-1 font-semibold tabular-nums text-black" style={{ fontSize: "clamp(36px, 7vh, 56px)" }} data-testid="kiosk-elapsed">
                  {hms(workedSeconds)}
                </p>
                <p className="text-[14px] text-[var(--color-text-muted)]">{session.on_break ? t("kiosk.on_break") : t("kiosk.elapsed")}</p>
              </div>
            ) : null}
            <p className={cn("mt-2 h-6 text-[16px] font-semibold text-[var(--color-danger)]", !error && "invisible")} role="alert">
              {error ?? "."}
            </p>
            <div className="mt-[1vh] flex w-full flex-col gap-3">
              {session ? (
                <>
                  <button
                    type="button"
                    onClick={() => void act("out")}
                    disabled={busy}
                    className="inline-flex min-h-[min(9vh,64px)] items-center justify-center gap-2 rounded-full bg-[var(--color-danger)] text-[20px] font-semibold text-white disabled:opacity-40"
                  >
                    <LogOut className="size-6" /> {t("kiosk.end_shift")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void act("break")}
                    disabled={busy}
                    className="inline-flex min-h-[min(8vh,56px)] items-center justify-center gap-2 rounded-full bg-white text-[18px] font-semibold text-black shadow-[0_1px_3px_rgba(0,0,0,0.08)] disabled:opacity-40"
                  >
                    <Coffee className="size-5" /> {session.on_break ? t("kiosk.end_break") : t("kiosk.start_break")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void act("in")}
                  disabled={busy || device?.enabled === false}
                  className="inline-flex min-h-[min(9vh,64px)] items-center justify-center gap-2 rounded-full bg-[var(--color-success)] text-[20px] font-semibold text-white disabled:opacity-40"
                >
                  <LogIn className="size-6" /> {t("kiosk.start_shift")}
                </button>
              )}
              <button
                type="button"
                onClick={backToKeypad}
                className="inline-flex min-h-[min(8vh,56px)] items-center justify-center gap-2 rounded-full bg-[var(--color-fill)] text-[18px] font-semibold text-[#3c3c43]"
              >
                <X className="size-5" /> {t("kiosk.exit_person")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[20px] font-semibold text-black">
              {mode === "exit" ? t("kiosk.manager_pin") : device?.enabled === false ? t("kiosk.disabled") : t("kiosk.enter_pin")}
            </p>
            <div className="mt-[1.5vh] flex h-6 items-center gap-3" aria-label={t("kiosk.enter_pin")}>
              {dots.map((filled, index) => (
                <span key={index} className={cn("size-4 rounded-full border-2 border-black", filled && "bg-black")} />
              ))}
            </div>
            <p className={cn("mt-[1vh] h-6 text-[16px] font-semibold text-[var(--color-danger)]", !error && "invisible")} role="alert">
              {error ?? "."}
            </p>
            <div className="mt-[1vh] grid grid-cols-3 justify-items-center gap-x-5 gap-y-[1.6vh]">
              {KEYS.map((key, index) =>
                key === "" ? (
                  <span key={index} style={KEY_SIZE} />
                ) : (
                  <button
                    key={index}
                    type="button"
                    onClick={() => press(key)}
                    aria-label={key === "del" ? t("kiosk.delete") : key}
                    style={KEY_SIZE}
                    className="grid place-items-center rounded-full bg-white text-[min(4vh,32px)] font-semibold text-black shadow-[0_1px_3px_rgba(0,0,0,0.08)] active:bg-[var(--color-fill)]"
                  >
                    {key === "del" ? <Delete className="size-7" /> : key}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              onClick={() => void openPerson(pin)}
              disabled={pin.length < 4 || busy || (mode === "punch" && device?.enabled === false)}
              className="mt-[2.5vh] min-h-[min(8vh,56px)] w-full rounded-full bg-[var(--color-primary-strong)] text-[18px] font-semibold text-white disabled:opacity-40"
            >
              {mode === "exit" ? t("kiosk.open_panel") : t("kiosk.continue")}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
