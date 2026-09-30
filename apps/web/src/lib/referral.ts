/** Remembers the ?ref=CODE a visitor arrived with, so it can go along with their sign-up. */
const KEY = "platofy.ref";
const TTL_DAYS = 60;

export function captureReferral() {
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code && /^[A-Za-z0-9]{4,16}$/.test(code)) {
      localStorage.setItem(KEY, JSON.stringify({ code: code.toUpperCase(), at: Date.now() }));
    }
  } catch {
    // Private mode: no referral, nothing breaks.
  }
}

export function storedReferral(): string | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    return Date.now() - at < TTL_DAYS * 86_400_000 ? code : undefined;
  } catch {
    return undefined;
  }
}

export function clearReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
