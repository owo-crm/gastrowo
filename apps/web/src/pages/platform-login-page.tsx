import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import qrcode from "qrcode-generator";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { savePlatformSession, usePlatformSession } from "@/lib/platform-session";

type Step = { kind: "email" } | { kind: "code" } | { kind: "totp"; ticket: string } | { kind: "setup"; ticket: string; secret: string; uri: string };

function QrCode({ value }: { value: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }, [value]);
  return <div className="mx-auto size-48 rounded-xl bg-white p-1 [&>svg]:size-full" role="img" aria-label="QR code for the authenticator app" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Sign-in to the admin panel: email code, then a code from an authenticator app. */
export function PlatformLoginPage() {
  const { token } = usePlatformSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith("/platform") ? params.get("next")! : "/platform";
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Admin sign-in · Platofy";
  }, []);

  if (token) return <Navigate to={next} replace />;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind === "email") {
      void run(async () => {
        await api.platformAuthStart(email.trim());
        setCode("");
        setStep({ kind: "code" });
      });
    } else if (step.kind === "code") {
      void run(async () => {
        const result = await api.platformVerifyEmail(email.trim(), code.trim());
        setCode("");
        if (result.next === "setup" && result.secret && result.otpauth_uri) setStep({ kind: "setup", ticket: result.ticket, secret: result.secret, uri: result.otpauth_uri });
        else setStep({ kind: "totp", ticket: result.ticket });
      });
    } else {
      const ticket = step.ticket;
      void run(async () => {
        const session = await api.platformVerifyTotp(ticket, code.trim());
        savePlatformSession(session.token, session.expires_in_seconds, session.email);
        navigate(next, { replace: true });
      });
    }
  };

  const codeInput = (label: string) => (
    <Input
      value={code}
      onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      placeholder="123456"
      aria-label={label}
      className="text-center text-[22px] tracking-[0.3em]"
    />
  );

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0f172a] px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-[400px] rounded-[24px] bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid size-10 place-items-center rounded-full bg-[#0f172a] text-white">
            <ShieldCheck className="size-5 text-[#ff7a2f]" aria-hidden />
          </span>
          <div>
            <h1 className="text-[20px] font-semibold leading-6 text-black">Platofy Admin</h1>
            <p className="text-[13px] text-[var(--color-text-muted)]">Separate from your business account</p>
          </div>
        </div>

        {step.kind === "email" ? (
          <>
            <label className="mb-1.5 block text-[14px] font-semibold text-black" htmlFor="platform-email">
              Admin email
            </label>
            <Input id="platform-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus required />
            <Button type="submit" className="mt-4 w-full" disabled={busy || !email.includes("@")}>
              Send code
            </Button>
          </>
        ) : null}

        {step.kind === "code" ? (
          <>
            <p className="mb-3 text-[15px] text-black">If {email} is an admin address, a 6-digit code is on its way.</p>
            {codeInput("Email code")}
            <Button type="submit" className="mt-4 w-full" disabled={busy || code.length !== 6}>
              Continue
            </Button>
            <button type="button" className="mt-3 w-full text-[14px] font-semibold text-[var(--color-primary-strong)]" onClick={() => setStep({ kind: "email" })}>
              Use another email
            </button>
          </>
        ) : null}

        {step.kind === "setup" ? (
          <>
            <p className="mb-3 text-[15px] text-black">
              First sign-in: scan this with Google Authenticator, 1Password or any authenticator app, then enter the 6-digit code it shows.
            </p>
            <QrCode value={step.uri} />
            <p className="mt-3 text-center text-[12px] text-[var(--color-text-muted)]">Can't scan? Enter this key by hand:</p>
            <p className="mb-4 select-all break-all text-center font-mono text-[13px] text-black" data-testid="platform-totp-secret">
              {step.secret}
            </p>
            {codeInput("Authenticator code")}
            <Button type="submit" className="mt-4 w-full" disabled={busy || code.length !== 6}>
              Turn on and sign in
            </Button>
          </>
        ) : null}

        {step.kind === "totp" ? (
          <>
            <p className="mb-3 text-[15px] text-black">Enter the 6-digit code from your authenticator app.</p>
            {codeInput("Authenticator code")}
            <Button type="submit" className="mt-4 w-full" disabled={busy || code.length !== 6}>
              Sign in
            </Button>
          </>
        ) : null}

        {error ? (
          <p className="mt-3 text-[14px] text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        ) : null}
        <p className="mt-5 text-[12px] leading-4 text-[var(--color-text-muted)]">The session lasts one hour and ends when you close this tab.</p>
      </form>
    </div>
  );
}
