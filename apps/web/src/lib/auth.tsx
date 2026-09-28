import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ApiError, api } from "@/lib/api";
import type { AuthLoginResponse, MeResponse, OtpSendPurpose, OtpSendResponse, OtpVerifyResponse } from "@/lib/types";

const TOKEN_STORAGE_KEY = "gastrowo.token";
const LEGACY_TOKEN_STORAGE_KEY = "workdish.token";
const EXPLICIT_LOGOUT_STORAGE_KEY = "gastrowo.explicit-logout";

type AuthContextValue = {
  token: string | null;
  me: MeResponse | null;
  isLoading: boolean;
  hasExplicitLogoutGuard: boolean;
  refreshMe: () => Promise<void>;
  sendOtp: (payload: { email: string; purpose: OtpSendPurpose; invite_token?: string | null }) => Promise<OtpSendResponse>;
  verifyOtp: (payload: { email: string; code: string; purpose: OtpSendPurpose; full_name?: string; invite_token?: string | null }) => Promise<OtpVerifyResponse>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  devLogin: (secret?: string | null, asRole?: "admin" | "staff") => Promise<void>;
  completeOwnerOnboarding: (payload: {
    verification_token: string;
    full_name: string;
    organization_name: string;
    password: string;
    source: string;
    country?: "US" | "PL";
  }) => Promise<void>;
  verifyInviteJoin: (payload: { email: string; code: string; invite_token: string; full_name?: string }) => Promise<void>;
  acceptInvite: (payload: { email: string; invite_token: string; full_name: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function hasSessionToken(payload: AuthLoginResponse | OtpVerifyResponse): payload is AuthLoginResponse {
  return typeof payload.access_token === "string" && payload.access_token.length > 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY) ?? localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY));
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasExplicitLogoutGuard, setHasExplicitLogoutGuard] = useState(() => sessionStorage.getItem(EXPLICIT_LOGOUT_STORAGE_KEY) === "1");
  const authRunIdRef = useRef(0);

  const clearLocalSession = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    setToken(null);
    setMe(null);
  };

  const hydrateMe = async (nextToken: string) => {
    const currentMe = await api.me(nextToken);
    setMe(currentMe);
  };

  const applyLocalSession = (nextToken: string) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(EXPLICIT_LOGOUT_STORAGE_KEY);
    setHasExplicitLogoutGuard(false);
    setToken(nextToken);
  };

  /**
   * Access tokens expire after 12 hours. When one is rejected, get a fresh one from the remembered
   * session cookie (30 days) instead of leaving the user "signed in" without a profile.
   */
  const refreshFromRememberedSession = async (): Promise<boolean> => {
    try {
      const session = await api.bootstrapSession();
      if (!session) return false;
      applyLocalSession(session.access_token);
      await hydrateMe(session.access_token);
      return true;
    } catch {
      return false;
    }
  };

  const isAuthError = (error: unknown) => error instanceof ApiError && (error.status === 401 || error.status === 403);

  const applySession = async (nextToken: string) => {
    applyLocalSession(nextToken);
    await hydrateMe(nextToken);
  };

  useEffect(() => {
    let cancelled = false;
    const runId = ++authRunIdRef.current;
    const isStale = () => cancelled || authRunIdRef.current !== runId;

    const run = async () => {
      const shouldSkipBootstrap = sessionStorage.getItem(EXPLICIT_LOGOUT_STORAGE_KEY) === "1";
      if (token) {
        try {
          await hydrateMe(token);
        } catch (error) {
          if (isAuthError(error)) {
            // Expired or revoked token: renew it silently, or sign out if that is not possible.
            const renewed = await refreshFromRememberedSession();
            if (!renewed && !isStale()) clearLocalSession();
          } else if (!isStale()) {
            // Network hiccup: keep the session; the app offers "Try again".
            setMe(null);
          }
        } finally {
          if (!isStale()) {
            setIsLoading(false);
          }
        }
        return;
      }

      if (shouldSkipBootstrap) {
        if (!isStale()) {
          setHasExplicitLogoutGuard(true);
          clearLocalSession();
          setIsLoading(false);
        }
        return;
      }

      try {
        const session = await api.bootstrapSession();
        if (isStale() || sessionStorage.getItem(EXPLICIT_LOGOUT_STORAGE_KEY) === "1") {
          return;
        }
        if (!session) {
          clearLocalSession();
          return;
        }
        applyLocalSession(session.access_token);
        try {
          await hydrateMe(session.access_token);
        } catch {
          if (!isStale()) {
            setMe(null);
          }
        }
      } catch {
        if (!isStale()) {
          clearLocalSession();
        }
      } finally {
        if (!isStale()) {
          setIsLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    // Refresh permissions/plan when the tab is in use; hidden tabs don't poll.
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      void hydrateMe(token).catch(async (error) => {
        if (!isAuthError(error)) return;
        if (!(await refreshFromRememberedSession())) clearLocalSession();
      });
    };
    const interval = window.setInterval(sync, 120000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [token]);

  const sendOtp = (payload: { email: string; purpose: OtpSendPurpose; invite_token?: string | null }) => api.sendOtp(payload);

  const verifyOtp = async (payload: { email: string; code: string; purpose: OtpSendPurpose; full_name?: string; invite_token?: string | null }) => {
    const response = await api.verifyOtp(payload);
    if (hasSessionToken(response)) {
      await applySession(response.access_token);
    }
    return response;
  };

  const loginWithPassword = async (email: string, password: string) => {
    const response = await api.loginWithPassword({ email, password });
    await applySession(response.access_token);
  };

  const devLogin = async (secret?: string | null, asRole: "admin" | "staff" = "admin") => {
    const response = await api.devLogin(secret, asRole);
    await applySession(response.access_token);
  };

  const completeOwnerOnboarding = async (payload: {
    verification_token: string;
    full_name: string;
    organization_name: string;
    password: string;
    source: string;
    country?: "US" | "PL";
  }) => {
    const response = await api.completeOwnerOnboarding(payload);
    await applySession(response.access_token);
  };

  const verifyInviteJoin = async (payload: { email: string; code: string; invite_token: string; full_name?: string }) => {
    const response = await api.verifyInviteJoin(payload);
    await applySession(response.access_token);
  };

  const acceptInvite = async (payload: { email: string; invite_token: string; full_name: string; password: string }) => {
    const response = await api.acceptInvite(payload);
    await applySession(response.access_token);
  };

  const logout = async () => {
    authRunIdRef.current += 1;
    sessionStorage.setItem(EXPLICIT_LOGOUT_STORAGE_KEY, "1");
    setHasExplicitLogoutGuard(true);
    try {
      await api.logout();
    } catch {
      // Keep local logout reliable even if the server cookie clear fails.
    }
    clearLocalSession();
  };

  const refreshMe = async () => {
    if (!token) return;
    await hydrateMe(token);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      me,
      isLoading,
      hasExplicitLogoutGuard,
      refreshMe,
      sendOtp,
      verifyOtp,
      loginWithPassword,
      devLogin,
      completeOwnerOnboarding,
      verifyInviteJoin,
      acceptInvite,
      logout,
    }),
    [token, me, isLoading, hasExplicitLogoutGuard],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
