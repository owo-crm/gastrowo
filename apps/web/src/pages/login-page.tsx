import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Lock, Mail } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Persona = "owner" | "worker";
type AuthMode = "onboarding" | "signin";
type SourceOption = "Google" | "Instagram" | "TikTok" | "Recommendation" | "Friends" | "Other";
type AuthFieldError = {
  email?: string;
  password?: string;
  code?: string;
  general?: string;
};

const sourceOptions: SourceOption[] = ["Google", "Instagram", "TikTok", "Recommendation", "Friends", "Other"];

function StepPill({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
      <span>{label}</span>
    </div>
  );
}

function DevHint({ code, label }: { code?: string | null; label: string }) {
  if (!code) return null;
  return <p className="text-xs text-[var(--color-text-muted)]">{label} <span className="font-mono text-[var(--color-heading)]">{code}</span></p>;
}

export function LoginPage() {
  const { sendOtp, verifyOtp, loginWithPassword, completeOwnerOnboarding, verifyInviteJoin } = useAuth();
  const toast = useToast();
  const { lang, setLang, t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  const inviteToken = searchParams.get("token")?.trim() || "";
  const invitedEmail = searchParams.get("email")?.trim().toLowerCase() || "";
  const isInviteJoin = Boolean(inviteToken && invitedEmail);
  const requestedMode: AuthMode = searchParams.get("mode") === "signin" ? "signin" : "onboarding";

  const [mode, setMode] = useState<AuthMode>(requestedMode);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [persona, setPersona] = useState<Persona>("owner");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [source, setSource] = useState<SourceOption | "">("");
  const [passwordLogin, setPasswordLogin] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldError>({});
  const sendInFlightRef = useRef(false);

  useEffect(() => {
    if (!isInviteJoin) {
      setMode(requestedMode);
    }
  }, [isInviteJoin, requestedMode]);

  const effectiveEmail = isInviteJoin ? invitedEmail : email.trim().toLowerCase();
  const updateModeParam = (nextMode: AuthMode) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("mode", nextMode);
    setSearchParams(nextParams, { replace: true });
  };
  const resetTransientState = () => {
    setOtpCode("");
    setOtpSent(false);
    setDebugCode(null);
    setVerificationToken("");
    setPassword("");
    setConfirmPassword("");
    setOrganizationName("");
    setSource("");
    setLoginPassword("");
    setPasswordLogin(false);
    setFieldErrors({});
  };

  const clearFieldError = (field: keyof AuthFieldError) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      return { ...current, [field]: undefined };
    });
  };

  const setInlineError = (field: keyof AuthFieldError, message: string) => {
    setFieldErrors({ [field]: message });
  };

  const mapAuthError = (error: unknown): { field: keyof AuthFieldError; message: string } => {
    const message = error instanceof Error ? error.message : "";
    if (message === "NETWORK_ERROR" || message === "Failed to fetch") {
      return { field: "general", message: t("login.error.network") };
    }
    if (message === "Account with this email was not found") {
      return { field: "email", message: t("login.error.email_not_found") };
    }
    if (message === "Invalid password") {
      return { field: "password", message: t("login.error.invalid_password") };
    }
    if (message === "Email already exists") {
      return { field: "email", message: t("login.error.email_exists") };
    }
    if (message === "Invalid code" || message === "Code expired" || message === "Code already used") {
      return { field: "code", message: t("login.error.invalid_code") };
    }
    return { field: "general", message: message || t("login.error.inline_fallback") };
  };

  const renderInlineError = (field: keyof AuthFieldError) =>
    fieldErrors[field] ? <p className="text-sm font-medium text-[var(--color-danger)]">{fieldErrors[field]}</p> : null;

  const switchToSignin = () => {
    resetTransientState();
    setMode("signin");
    setStep(1);
    updateModeParam("signin");
  };

  const switchToOnboarding = () => {
    resetTransientState();
    setMode("onboarding");
    setStep(1);
    updateModeParam("onboarding");
  };

  const handleSendCode = async (purpose: "login" | "owner_signup" | "worker_signup" | "invite_join") => {
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      setFieldErrors({});
      setOtpCode("");
      const response = await sendOtp({
        email: effectiveEmail,
        purpose,
        invite_token: purpose === "invite_join" ? inviteToken : undefined,
      });
      setOtpSent(true);
      setDebugCode(response.debug_code ?? null);
      toast.success(t("login.code_sent"), t("login.code_sent_body", { email: effectiveEmail }));
    } catch (error) {
      const mapped = mapAuthError(error);
      setInlineError(mapped.field, mapped.message);
    } finally {
      sendInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleVerifyOnboardingCode = async () => {
    setIsSubmitting(true);
    try {
      setFieldErrors({});
      const response = await verifyOtp({
        email: effectiveEmail,
        code: otpCode,
        purpose: persona === "owner" ? "owner_signup" : "worker_signup",
        full_name: persona === "worker" ? fullName.trim() : undefined,
      });
      if (persona === "worker") {
        toast.success("Account created");
        return;
      }
      if (!response.verification_token) {
        throw new Error(t("login.missing_token"));
      }
      setVerificationToken(response.verification_token);
      setStep(3);
    } catch (error) {
      const mapped = mapAuthError(error);
      setInlineError(mapped.field, mapped.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteOwner = async () => {
    if (password.length < 8) {
      toast.error(t("login.password_short"), t("login.password_short_body"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("login.password_mismatch"));
      return;
    }
    if (!organizationName.trim()) {
      toast.error(t("login.business_name_required"));
      return;
    }
    if (!source) {
      toast.error(t("login.source_required"));
      return;
    }

    setIsSubmitting(true);
    try {
      await completeOwnerOnboarding({
        verification_token: verificationToken,
        full_name: fullName.trim(),
        organization_name: organizationName.trim(),
        password,
        source,
      });
      toast.success(t("login.business_created"));
    } catch (error) {
      toast.error(t("login.verify_failed"), error instanceof Error ? error.message : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyLoginCode = async () => {
    setIsSubmitting(true);
    try {
      setFieldErrors({});
      await verifyOtp({ email: effectiveEmail, code: otpCode, purpose: "login" });
      toast.success(t("login.sign_in_success"));
    } catch (error) {
      const mapped = mapAuthError(error);
      setInlineError(mapped.field, mapped.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordLogin = async () => {
    setIsSubmitting(true);
    try {
      setFieldErrors({});
      await loginWithPassword(effectiveEmail, loginPassword);
      toast.success(t("login.sign_in_success"));
    } catch (error) {
      const mapped = mapAuthError(error);
      setInlineError(mapped.field, mapped.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInviteJoin = async () => {
    setIsSubmitting(true);
    try {
      setFieldErrors({});
      await verifyInviteJoin({ email: effectiveEmail, code: otpCode, invite_token: inviteToken });
      toast.success(t("login.business_joined"));
      searchParams.delete("token");
      searchParams.delete("email");
      setSearchParams(searchParams, { replace: true });
    } catch (error) {
      const mapped = mapAuthError(error);
      setInlineError(mapped.field, mapped.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInviteJoin = () => (
    <div className="space-y-5">
      <StepPill current={1} total={1} label={t("login.step", { current: 1, total: 1 })} />
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">{t("login.invite.title")}</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t("login.invite.body")}</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.email")}</label>
        <Input value={effectiveEmail} disabled />
      </div>
      {renderInlineError("email")}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="button" onClick={() => handleSendCode("invite_join")} disabled={isSubmitting}>
          <Mail className="size-4" /> {t("login.send_code")}
        </Button>
        <DevHint code={debugCode} label={t("login.dev_code", { code: "" }).replace(/\s*$/, "")} />
      </div>
      {otpSent ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.code_label")}</label>
            <Input
              value={otpCode}
              onChange={(event) => {
                clearFieldError("code");
                clearFieldError("general");
                setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              }}
              inputMode="numeric"
              placeholder={t("login.code_placeholder")}
            />
          </div>
          {renderInlineError("code")}
          {renderInlineError("general")}
          <Button type="button" className="w-full" onClick={handleInviteJoin} disabled={isSubmitting || otpCode.length !== 6}>
            {t("login.join_business")}
          </Button>
        </div>
      ) : null}
    </div>
  );

  const renderSignin = () => (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">{t("login.signin.title")}</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t("login.signin.body")}</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.email")}</label>
        <Input
          type="email"
          value={email}
          onChange={(event) => {
            clearFieldError("email");
            clearFieldError("general");
            setEmail(event.target.value);
          }}
          placeholder={t("login.email_placeholder")}
        />
      </div>
      {renderInlineError("email")}
      {passwordLogin ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.password")}</label>
            <Input
              type="password"
              value={loginPassword}
              onChange={(event) => {
                clearFieldError("password");
                clearFieldError("general");
                setLoginPassword(event.target.value);
              }}
              placeholder={t("login.password_placeholder")}
            />
          </div>
          {renderInlineError("password")}
          {renderInlineError("general")}
          <Button type="button" className="w-full" onClick={handlePasswordLogin} disabled={isSubmitting || !effectiveEmail || !loginPassword}>
            {t("login.signin_with_password")}
          </Button>
          <button type="button" className="text-sm text-[var(--color-primary)]" onClick={() => setPasswordLogin(false)}>
            {t("login.use_code_instead")}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="button" onClick={() => handleSendCode("login")} disabled={isSubmitting || !effectiveEmail}>
              <Mail className="size-4" /> {t("login.send_code")}
            </Button>
            <DevHint code={debugCode} label={t("login.dev_code", { code: "" }).replace(/\s*$/, "")} />
          </div>
          {otpSent ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.code_label")}</label>
                <Input
                  value={otpCode}
                  onChange={(event) => {
                    clearFieldError("code");
                    clearFieldError("general");
                    setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  }}
                  inputMode="numeric"
                  placeholder={t("login.code_placeholder")}
                />
              </div>
              {renderInlineError("code")}
              {renderInlineError("general")}
              <Button type="button" className="w-full" onClick={handleVerifyLoginCode} disabled={isSubmitting || otpCode.length !== 6}>
                {t("login.sign_in")}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <div className="flex flex-col items-start gap-3 pt-1">
        {!passwordLogin ? (
          <button
            type="button"
            className="inline-flex max-w-full items-start gap-2 text-left text-sm leading-5 text-[var(--color-primary)]"
            onClick={() => setPasswordLogin(true)}
          >
            <Lock className="mt-0.5 size-4 shrink-0" /> <span>{t("login.use_password_instead")}</span>
          </button>
        ) : null}
        <button type="button" className="max-w-full text-left text-sm leading-5 text-[var(--color-primary)]" onClick={switchToOnboarding}>
          {t("login.start_onboarding")}
        </button>
      </div>
    </div>
  );

  const renderOnboarding = () => {
    if (step === 1) {
      return (
        <div className="space-y-5">
          <StepPill current={1} total={4} label={t("login.step", { current: 1, total: 4 })} />
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">{t("login.onboarding.step1.title")}</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t("login.onboarding.step1.body")}</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.full_name")}</label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={t("login.full_name_placeholder")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPersona("owner")}
              className={cn(
                "rounded-[1.2rem] border px-4 py-4 text-left transition",
                persona === "owner" ? "border-[var(--color-primary)] bg-[rgba(47,111,237,0.08)]" : "border-[var(--color-border)] bg-white",
              )}
            >
              <p className="font-semibold text-[var(--color-heading)]">{t("login.owner_title")}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("login.owner_body")}</p>
            </button>
            <button
              type="button"
              onClick={() => setPersona("worker")}
              className={cn(
                "rounded-[1.2rem] border px-4 py-4 text-left transition",
                persona === "worker" ? "border-[var(--color-primary)] bg-[rgba(47,111,237,0.08)]" : "border-[var(--color-border)] bg-white",
              )}
            >
              <p className="font-semibold text-[var(--color-heading)]">{t("login.worker_title")}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("login.worker_body")}</p>
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="text-sm text-[var(--color-primary)]" onClick={switchToSignin}>
              {t("login.have_account")}
            </button>
            <Button type="button" onClick={() => setStep(2)} disabled={fullName.trim().length < 2}>
              {t("common.continue")} <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <StepPill current={2} total={4} label={t("login.step", { current: 2, total: 4 })} />
            <button type="button" className="inline-flex items-center gap-2 text-sm text-[var(--color-primary)]" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" /> {t("common.back")}
            </button>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">{t("login.onboarding.step2.title")}</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t("login.onboarding.step2.body")}</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.email")}</label>
            <Input
              type="email"
              value={email}
              onChange={(event) => {
                clearFieldError("email");
                clearFieldError("general");
                setEmail(event.target.value);
              }}
              placeholder={t("login.email_placeholder")}
            />
          </div>
          {renderInlineError("email")}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="button" onClick={() => handleSendCode(persona === "owner" ? "owner_signup" : "worker_signup")} disabled={isSubmitting || !effectiveEmail}>
              <Mail className="size-4" /> {t("login.send_code")}
            </Button>
            <DevHint code={debugCode} label={t("login.dev_code", { code: "" }).replace(/\s*$/, "")} />
          </div>
          {otpSent ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.code_label")}</label>
                <Input
                  value={otpCode}
                  onChange={(event) => {
                    clearFieldError("code");
                    clearFieldError("general");
                    setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  }}
                  inputMode="numeric"
                  placeholder={t("login.code_placeholder")}
                />
              </div>
              {renderInlineError("code")}
              {renderInlineError("general")}
              <Button type="button" className="w-full" onClick={handleVerifyOnboardingCode} disabled={isSubmitting || otpCode.length !== 6}>
                {t("login.verify_code")}
              </Button>
            </div>
          ) : null}
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <StepPill current={3} total={4} label={t("login.step", { current: 3, total: 4 })} />
            <button type="button" className="inline-flex items-center gap-2 text-sm text-[var(--color-primary)]" onClick={() => setStep(2)}>
              <ArrowLeft className="size-4" /> {t("common.back")}
            </button>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">{t("login.onboarding.step3.title")}</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t("login.onboarding.step3.body")}</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.password")}</label>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("login.password_min_placeholder")} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.confirm_password")}</label>
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={t("login.confirm_password_placeholder")} />
          </div>
          <Button type="button" className="w-full" onClick={() => setStep(4)} disabled={password.length < 8 || confirmPassword.length < 8 || password !== confirmPassword}>
            {t("common.continue")}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <StepPill current={4} total={4} label={t("login.step", { current: 4, total: 4 })} />
          <button type="button" className="inline-flex items-center gap-2 text-sm text-[var(--color-primary)]" onClick={() => setStep(3)}>
            <ArrowLeft className="size-4" /> {t("common.back")}
          </button>
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">{t("login.onboarding.step4.title")}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t("login.onboarding.step4.body")}</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.business_name")}</label>
          <Input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder={t("login.business_name_placeholder")} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--color-heading)]">{t("login.heard_about")}</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {sourceOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSource(item)}
                className={cn(
                  "rounded-[1rem] border px-3 py-3 text-left text-sm font-medium transition",
                  source === item ? "border-[var(--color-primary)] bg-[rgba(47,111,237,0.08)] text-[var(--color-primary)]" : "border-[var(--color-border)] bg-white text-[var(--color-heading)]",
                )}
              >
                {t(`source.${item}`)}
              </button>
            ))}
          </div>
        </div>
        <Button type="button" className="w-full" onClick={handleCompleteOwner} disabled={isSubmitting || !organizationName.trim() || !source}>
          {t("login.create_business")}
        </Button>
      </div>
    );
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[linear-gradient(180deg,#f8fbff,#eef4fb)] px-4 py-6 md:px-8 md:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(47,111,237,0.10),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(104,240,93,0.10),transparent_26%)]" />
      <div className="relative mx-auto max-w-[1180px]">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="shrink-0">
            <BrandLogo kind="wordmark" tone="light" className="h-12 w-auto sm:h-14" />
          </Link>
          <div className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-white/92 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur">
            {(["en", "pl", "ru"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLang(item)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition",
                  lang === item ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-heading)]",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-[calc(100dvh-8.5rem)] items-center justify-center py-8 md:py-12">
          <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }} className="w-full max-w-[38rem]">
            <Card className="w-full rounded-[1.9rem] border border-[rgba(148,163,184,0.16)] bg-white/98 p-2 shadow-[0_28px_65px_rgba(15,23,42,0.08)]">
              <CardHeader className="p-5 pb-3 md:p-6 md:pb-3">
                <div className="mb-4 flex flex-wrap gap-2">
                  {[t("login.mode.onboarding_title"), t("login.mode.signin_title"), t("login.mode.join_title")].map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-[rgba(216,225,236,0.92)] bg-[rgba(243,247,251,0.86)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <CardTitle className="text-[2rem] tracking-tight">
                  {isInviteJoin ? t("login.mode.join_title") : mode === "signin" ? t("login.mode.signin_title") : t("login.mode.onboarding_title")}
                </CardTitle>
                <CardDescription>
                  {isInviteJoin
                    ? t("login.mode.join_description")
                    : mode === "signin"
                      ? t("login.mode.signin_description")
                      : t("login.mode.onboarding_description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-2 md:p-6 md:pt-2">
                <motion.div key={`${mode}-${step}-${isInviteJoin ? "invite" : "default"}`} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
                  {isInviteJoin ? renderInviteJoin() : mode === "signin" ? renderSignin() : renderOnboarding()}
                </motion.div>
              </CardContent>
            </Card>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
