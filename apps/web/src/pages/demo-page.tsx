import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";

/**
 * The public "demo look": builds a fresh restaurant with a month of made-up data for this visitor and
 * signs them into it. It lives only in this browser and is deleted after a day.
 */
export function DemoPage() {
  const { startDemo } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = async () => {
    setError(null);
    try {
      await startDemo(lang === "pl" ? "PL" : "US");
      navigate("/overview", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("demo.failed"));
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--color-bg)] px-6 text-center">
      <div className="max-w-sm">
        <BrandLogo kind="wordmark" className="text-[2.2rem]" />
        {error ? (
          <>
            <p className="mt-6 text-[17px] font-semibold text-black">{t("demo.failed")}</p>
            <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">{error}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={() => void run()}>{t("demo.retry")}</Button>
              <Link to="/" className="inline-flex min-h-11 items-center px-3 text-[15px] font-semibold text-[var(--color-primary-strong)]">
                {t("demo.back")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mt-8 size-10 animate-spin rounded-full border-4 border-[var(--color-fill)] border-t-[var(--color-primary-strong)]" aria-hidden />
            <p className="mt-5 text-[17px] font-semibold text-black" role="status">
              {t("demo.preparing")}
            </p>
            <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">{t("demo.preparing_body")}</p>
          </>
        )}
      </div>
    </main>
  );
}
