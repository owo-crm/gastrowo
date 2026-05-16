import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api } from "@/lib/api";
import type { AuthLoginResponse, MeResponse, OtpSendPurpose, OtpSendResponse, OtpVerifyResponse } from "@/lib/types";

type AuthContextValue = {
  token: string | null;
  me: MeResponse | null;
  isLoading: boolean;
  refreshMe: () => Promise<void>;
  sendOtp: (payload: { email: string; purpose: OtpSendPurpose; invite_token?: string | null }) => Promise<OtpSendResponse>;
  verifyOtp: (payload: { email: string; code: string; purpose: OtpSendPurpose; full_name?: string; invite_token?: string | null }) => Promise<OtpVerifyResponse>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  completeOwnerOnboarding: (payload: {
    verification_token: string;
    full_name: string;
    organization_name: string;
    password: string;
    source: string;
  }) => Promise<void>;
  verifyInviteJoin: (payload: { email: string; code: string; invite_token: string }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function hasSessionToken(payload: AuthLoginResponse | OtpVerifyResponse): payload is AuthLoginResponse {
  return typeof payload.access_token === "string" && payload.access_token.length > 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("gastrowo.token") ?? localStorage.getItem("workdish.token"));
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hydrateMe = async (nextToken: string) => {
    const currentMe = await api.me(nextToken);
    setMe(currentMe);
  };

  const applySession = async (nextToken: string) => {
    localStorage.setItem("gastrowo.token", nextToken);
    localStorage.removeItem("workdish.token");
    setToken(nextToken);
    await hydrateMe(nextToken);
  };

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        await hydrateMe(token);
      } catch {
        localStorage.removeItem("gastrowo.token");
        localStorage.removeItem("workdish.token");
        setToken(null);
        setMe(null);
      } finally {
        setIsLoading(false);
      }
    };
    void run();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const sync = () => {
      void hydrateMe(token).catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") sync();
    };
    const interval = window.setInterval(sync, 60000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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

  const completeOwnerOnboarding = async (payload: {
    verification_token: string;
    full_name: string;
    organization_name: string;
    password: string;
    source: string;
  }) => {
    const response = await api.completeOwnerOnboarding(payload);
    await applySession(response.access_token);
  };

  const verifyInviteJoin = async (payload: { email: string; code: string; invite_token: string }) => {
    const response = await api.verifyInviteJoin(payload);
    await applySession(response.access_token);
  };

  const logout = () => {
    localStorage.removeItem("gastrowo.token");
    localStorage.removeItem("workdish.token");
    setToken(null);
    setMe(null);
  };

  const refreshMe = async () => {
    if (!token) return;
    await hydrateMe(token);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ token, me, isLoading, refreshMe, sendOtp, verifyOtp, loginWithPassword, completeOwnerOnboarding, verifyInviteJoin, logout }),
    [token, me, isLoading],
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
