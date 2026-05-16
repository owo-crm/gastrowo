import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Lock, Mail, Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Persona = "owner" | "worker";
type SourceOption = "Google" | "Instagram" | "TikTok" | "Recommendation" | "Friends" | "Other";

const sourceOptions: SourceOption[] = ["Google", "Instagram", "TikTok", "Recommendation", "Friends", "Other"];

function StepPill({ current, total }: { current: number; total: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
      <span>Step {current} of {total}</span>
    </div>
  );
}

function DevHint({ code }: { code?: string | null }) {
  if (!code) return null;
  return <p className="text-xs text-[var(--color-text-muted)]">Dev code: <span className="font-mono text-[var(--color-heading)]">{code}</span></p>;
}

export function LoginPage() {
  const { sendOtp, verifyOtp, loginWithPassword, completeOwnerOnboarding, verifyInviteJoin } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const inviteToken = searchParams.get("token")?.trim() || "";
  const invitedEmail = searchParams.get("email")?.trim().toLowerCase() || "";
  const isInviteJoin = Boolean(inviteToken && invitedEmail);

  const [mode, setMode] = useState<"onboarding" | "signin">("onboarding");
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
  const sendInFlightRef = useRef(false);

  const effectiveEmail = isInviteJoin ? invitedEmail : email.trim().toLowerCase();
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
  };

  const switchToSignin = () => {
    resetTransientState();
    setMode("signin");
    setStep(1);
  };

  const switchToOnboarding = () => {
    resetTransientState();
    setMode("onboarding");
    setStep(1);
  };

  const handleSendCode = async (purpose: "login" | "owner_signup" | "worker_signup" | "invite_join") => {
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      setOtpCode("");
      const response = await sendOtp({
        email: effectiveEmail,
        purpose,
        invite_token: purpose === "invite_join" ? inviteToken : undefined,
      });
      setOtpSent(true);
      setDebugCode(response.debug_code ?? null);
      toast.success("Code sent", `Check ${effectiveEmail}`);
    } catch (error) {
      toast.error("Failed to send code", error instanceof Error ? error.message : undefined);
    } finally {
      sendInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleVerifyOnboardingCode = async () => {
    setIsSubmitting(true);
    try {
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
        throw new Error("Verification token missing");
      }
      setVerificationToken(response.verification_token);
      setStep(3);
    } catch (error) {
      toast.error("Verification failed", error instanceof Error ? error.message : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteOwner = async () => {
    if (password.length < 8) {
      toast.error("Password is too short", "Use at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!organizationName.trim()) {
      toast.error("Business name is required");
      return;
    }
    if (!source) {
      toast.error("Choose how you heard about us");
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
      toast.success("Business created");
    } catch (error) {
      toast.error("Onboarding failed", error instanceof Error ? error.message : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyLoginCode = async () => {
    setIsSubmitting(true);
    try {
      await verifyOtp({ email: effectiveEmail, code: otpCode, purpose: "login" });
      toast.success("Signed in");
    } catch (error) {
      toast.error("Sign in failed", error instanceof Error ? error.message : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordLogin = async () => {
    setIsSubmitting(true);
    try {
      await loginWithPassword(effectiveEmail, loginPassword);
      toast.success("Signed in");
    } catch (error) {
      toast.error("Password sign in failed", error instanceof Error ? error.message : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInviteJoin = async () => {
    setIsSubmitting(true);
    try {
      await verifyInviteJoin({ email: effectiveEmail, code: otpCode, invite_token: inviteToken });
      toast.success("Joined business");
      searchParams.delete("token");
      searchParams.delete("email");
      setSearchParams(searchParams, { replace: true });
    } catch (error) {
      toast.error("Invite verification failed", error instanceof Error ? error.message : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInviteJoin = () => (
    <div className="space-y-5">
      <StepPill current={1} total={1} />
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">Join your team</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Confirm the invited email and enter the 6-digit code to create your account and join the business.</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--color-heading)]">Email</label>
        <Input value={effectiveEmail} disabled />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="button" onClick={() => handleSendCode("invite_join")} disabled={isSubmitting}>
          <Mail className="size-4" /> Send code
        </Button>
        <DevHint code={debugCode} />
      </div>
      {otpSent ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">6-digit code</label>
            <Input value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" />
          </div>
          <Button type="button" className="w-full" onClick={handleInviteJoin} disabled={isSubmitting || otpCode.length !== 6}>
            Join business
          </Button>
        </div>
      ) : null}
    </div>
  );

  const renderSignin = () => (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">Returning sign in</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Workers use email + OTP. Owners can also use password.</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--color-heading)]">Email</label>
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@restaurant.com" />
      </div>
      {passwordLogin ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">Password</label>
            <Input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Owner password" />
          </div>
          <Button type="button" className="w-full" onClick={handlePasswordLogin} disabled={isSubmitting || !effectiveEmail || !loginPassword}>
            Sign in with password
          </Button>
          <button type="button" className="text-sm text-[var(--color-primary)]" onClick={() => setPasswordLogin(false)}>
            Use email code instead
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="button" onClick={() => handleSendCode("login")} disabled={isSubmitting || !effectiveEmail}>
              <Mail className="size-4" /> Send code
            </Button>
            <DevHint code={debugCode} />
          </div>
          {otpSent ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--color-heading)]">6-digit code</label>
                <Input value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" />
              </div>
              <Button type="button" className="w-full" onClick={handleVerifyLoginCode} disabled={isSubmitting || otpCode.length !== 6}>
                Sign in
              </Button>
            </div>
          ) : null}
          <button type="button" className="inline-flex items-center gap-2 text-sm text-[var(--color-primary)]" onClick={() => setPasswordLogin(true)}>
            <Lock className="size-4" /> Use password instead
          </button>
        </>
      )}
      <button type="button" className="text-sm text-[var(--color-primary)]" onClick={switchToOnboarding}>
        Need a new account? Start onboarding
      </button>
    </div>
  );

  const renderOnboarding = () => {
    if (step === 1) {
      return (
        <div className="space-y-5">
          <StepPill current={1} total={4} />
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">Are you an Owner or a Worker?</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">Start with your name and choose the account type.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">Full name</label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" />
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
              <p className="font-semibold text-[var(--color-heading)]">I&apos;m an Owner</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Create the business and keep password fallback.</p>
            </button>
            <button
              type="button"
              onClick={() => setPersona("worker")}
              className={cn(
                "rounded-[1.2rem] border px-4 py-4 text-left transition",
                persona === "worker" ? "border-[var(--color-primary)] bg-[rgba(47,111,237,0.08)]" : "border-[var(--color-border)] bg-white",
              )}
            >
              <p className="font-semibold text-[var(--color-heading)]">I&apos;m a Worker</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">OTP-only access. No password required.</p>
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="text-sm text-[var(--color-primary)]" onClick={switchToSignin}>
              Already have an account? Sign in
            </button>
            <Button type="button" onClick={() => setStep(2)} disabled={fullName.trim().length < 2}>
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <StepPill current={2} total={4} />
            <button type="button" className="inline-flex items-center gap-2 text-sm text-[var(--color-primary)]" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" /> Back
            </button>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">Verify your email</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">We send a 6-digit code valid for 5 minutes.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">Email</label>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@restaurant.com" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="button" onClick={() => handleSendCode(persona === "owner" ? "owner_signup" : "worker_signup")} disabled={isSubmitting || !effectiveEmail}>
              <Mail className="size-4" /> Send code
            </Button>
            <DevHint code={debugCode} />
          </div>
          {otpSent ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--color-heading)]">6-digit code</label>
                <Input value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" />
              </div>
              <Button type="button" className="w-full" onClick={handleVerifyOnboardingCode} disabled={isSubmitting || otpCode.length !== 6}>
                Verify code
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
            <StepPill current={3} total={4} />
            <button type="button" className="inline-flex items-center gap-2 text-sm text-[var(--color-primary)]" onClick={() => setStep(2)}>
              <ArrowLeft className="size-4" /> Back
            </button>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">Set your password</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">Owners keep password sign-in as an alternative to OTP.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">Password</label>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-heading)]">Confirm password</label>
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" />
          </div>
          <Button type="button" className="w-full" onClick={() => setStep(4)} disabled={password.length < 8 || confirmPassword.length < 8 || password !== confirmPassword}>
            Continue
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <StepPill current={4} total={4} />
          <button type="button" className="inline-flex items-center gap-2 text-sm text-[var(--color-primary)]" onClick={() => setStep(3)}>
            <ArrowLeft className="size-4" /> Back
          </button>
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--color-heading)]">Finish business setup</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Choose the business name and tell us how you heard about GastrOWO.</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--color-heading)]">Business name</label>
          <Input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Chicken i Kimchi" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--color-heading)]">How did you hear about us?</label>
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
                {item}
              </button>
            ))}
          </div>
        </div>
        <Button type="button" className="w-full" onClick={handleCompleteOwner} disabled={isSubmitting || !organizationName.trim() || !source}>
          Create business
        </Button>
      </div>
    );
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[linear-gradient(180deg,#f7fafc,#eef4fb)] px-4 py-6 md:px-8 md:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(47,111,237,0.10),transparent_24%),radial-gradient(circle_at_center_right,rgba(104,240,93,0.10),transparent_26%)]" />
      <div className="relative mx-auto grid min-h-[calc(100dvh-3rem)] max-w-[1440px] gap-4 lg:gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }} className="order-2 surface-card relative overflow-hidden rounded-[1.6rem] p-5 sm:p-6 md:p-8 xl:order-1 xl:rounded-[2rem] xl:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(47,111,237,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(104,240,93,0.16),transparent_26%)]" aria-hidden />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-[1.25rem] bg-[#68f05d] text-[#08100c] shadow-[0_18px_36px_rgba(104,240,93,0.18)]">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--color-heading)]">GastrOWO</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Restaurant operations workspace</p>
                </div>
              </div>
              <div className="mt-10 inline-flex items-center rounded-full bg-[rgba(47,111,237,0.10)] px-3 py-1 text-sm font-medium text-[var(--color-primary)]">
                GastrOWO workspace
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.07em] text-[var(--color-heading)] sm:text-5xl">
                Stay on top of shifts, staff, and restaurant operations without friction.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--color-text-muted)]">
                Streamline your workflow with intuitive task management. Keep everyone on the same page. Share your ideas, feedback,
                and files in one place.
              </p>
              <div className="mt-8 hidden gap-4 md:grid md:grid-cols-2">
                <div className="rounded-[1.35rem] border border-[var(--color-border)] bg-white/78 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
                  <p className="text-sm font-semibold text-emerald-600">Completed</p>
                  <p className="mt-2 text-[1.65rem] font-semibold tracking-[-0.04em] text-[var(--color-heading)]">Weekly schedule</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Generate, review, and apply restaurant shifts in one clean calendar.</p>
                </div>
                <div className="rounded-[1.35rem] border border-[var(--color-border)] bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Low</p>
                      <p className="mt-3 text-[1.45rem] font-semibold tracking-[-0.04em] text-[var(--color-heading)]">Shift requests</p>
                    </div>
                    <div className="flex -space-x-2">
                      {["AM", "KN", "IO"].map((initial) => (
                        <div key={initial} className="grid size-8 place-items-center rounded-full border-2 border-white bg-[var(--color-accent)] text-[11px] font-semibold text-[var(--color-primary)]">
                          {initial}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Keep workers aligned across locations, availability, and schedule changes.</p>
                </div>
              </div>
            </div>
            <div className="mt-4 hidden gap-4 md:grid md:grid-cols-3">
              {[
                ["Fast owner setup", "Create the workspace and invite existing users by email."],
                ["Worker-first access", "Workers only see compact tools they actually need."],
                ["Email-first auth", "OTP login and invite join replace the old UID fallback."],
              ].map(([title, description]) => (
                <div key={title} className="rounded-[1.15rem] border border-[var(--color-border)] bg-white/72 px-4 py-4 text-sm leading-6 text-[var(--color-text-muted)]">
                  <p className="font-semibold text-[var(--color-heading)]">{title}</p>
                  <p className="mt-2">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.06 }} className="order-1 flex items-start xl:order-2">
          <Card className="w-full p-1">
            <CardHeader className="p-5 pb-2 md:p-6 md:pb-2">
              <CardTitle className="text-[2rem]">{isInviteJoin ? "Join invitation" : mode === "signin" ? "Sign in" : "Get started"}</CardTitle>
              <CardDescription>
                {isInviteJoin
                  ? "Use the invited email and one-time code to join the business."
                  : mode === "signin"
                    ? "Returning access for owners, managers, and workers."
                    : "New onboarding wizard for owners and workers."}
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
  );
}
