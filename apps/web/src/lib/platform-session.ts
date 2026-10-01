import { useCallback, useEffect, useState } from "react";

/**
 * The admin-panel session: separate from the business sign-in, kept only for this browser tab
 * (sessionStorage) and for at most an hour.
 */

const KEY = "platofy.platform-session";
const CHANGE_EVENT = "platofy:platform-session";

type Stored = { token: string; expiresAt: number; email: string };

function read(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Stored;
    if (!value.token || value.expiresAt <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function savePlatformSession(token: string, expiresInSeconds: number, email: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token, email, expiresAt: Date.now() + expiresInSeconds * 1000 }));
  } catch {
    // Private mode without storage: the session lives until the page reloads.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearPlatformSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function usePlatformSession() {
  const [session, setSession] = useState<Stored | null>(read);

  useEffect(() => {
    const sync = () => setSession(read());
    window.addEventListener(CHANGE_EVENT, sync);
    // Sign out on the dot when the hour is up.
    const timer = session ? window.setTimeout(clearPlatformSession, Math.max(0, session.expiresAt - Date.now())) : undefined;
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      if (timer) window.clearTimeout(timer);
    };
  }, [session]);

  const signOut = useCallback(() => clearPlatformSession(), []);
  return { token: session?.token ?? null, email: session?.email ?? null, expiresAt: session?.expiresAt ?? null, signOut };
}
