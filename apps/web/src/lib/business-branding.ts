const BRANDING_PREFIX = "gastr_owo_business_branding";

function storageKey(organizationId?: string | null) {
  return `${BRANDING_PREFIX}:${organizationId ?? "workspace"}`;
}

export function loadBusinessLogo(organizationId?: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(organizationId));
  } catch {
    return null;
  }
}

export function saveBusinessLogo(organizationId: string | null | undefined, logoUrl: string | null) {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(organizationId);
    if (!logoUrl) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, logoUrl);
    }
    window.dispatchEvent(
      new CustomEvent("business-branding-updated", {
        detail: { organizationId: organizationId ?? null, logoUrl: logoUrl ?? null },
      }),
    );
  } catch {
    // Ignore localStorage failures and keep the UI usable.
  }
}
