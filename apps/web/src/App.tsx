import { Suspense, lazy, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { canAccessNotes, canAccessReport, canManageTeam, canViewOverview, canViewPayroll, hasPlanFeature } from "@/lib/access";
import { ProductTour } from "@/components/product-tour";
import { SupportLauncher } from "@/components/support-chat";
import { LandingPage } from "@/pages/landing-page";
import { LoginPage } from "@/pages/login-page";
import { PendingLinkPage } from "@/pages/pending-link-page";
import { useAuth } from "@/lib/auth";
import { getHomeRoute } from "@/lib/navigation";
import { EnglishOnly, PolishOnly, useLanguage } from "@/lib/i18n";

// App pages load on demand so the landing and login stay small.
const DemoPage = lazy(() => import("@/pages/demo-page").then((module) => ({ default: module.DemoPage })));
const DashboardPage = lazy(() => import("@/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })));
const BillingPage = lazy(() => import("@/pages/billing-page").then((module) => ({ default: module.BillingPage })));
const NotesDocumentsPage = lazy(() => import("@/pages/notes-documents-page").then((module) => ({ default: module.NotesDocumentsPage })));
const PayrollPage = lazy(() => import("@/pages/payroll-page").then((module) => ({ default: module.PayrollPage })));
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })));
const ReportPage = lazy(() => import("@/pages/report-page").then((module) => ({ default: module.ReportPage })));
const SchedulePage = lazy(() => import("@/pages/schedule-page").then((module) => ({ default: module.SchedulePage })));
const KioskPage = lazy(() => import("@/pages/kiosk-page").then((module) => ({ default: module.KioskPage })));
const PlatformSupportPage = lazy(() => import("@/pages/platform-support-page").then((module) => ({ default: module.PlatformSupportPage })));
const PlatformLoginPage = lazy(() => import("@/pages/platform-login-page").then((module) => ({ default: module.PlatformLoginPage })));
const PlatformGuard = lazy(() => import("@/components/platform-shell").then((module) => ({ default: module.PlatformGuard })));
const PlatformPage = lazy(() => import("@/pages/platform-page").then((module) => ({ default: module.PlatformPage })));
const StartPage = lazy(() => import("@/pages/start-page").then((module) => ({ default: module.StartPage })));
const TasksPage = lazy(() => import("@/pages/tasks-page").then((module) => ({ default: module.TasksPage })));
const TeamPage = lazy(() => import("@/pages/team/team-page").then((module) => ({ default: module.TeamPage })));
const ToolsHubPage = lazy(() => import("@/pages/tools-pages").then((module) => ({ default: module.ToolsHubPage })));
const ScheduleTemplatePage = lazy(() => import("@/pages/tools-pages").then((module) => ({ default: module.ScheduleTemplatePage })));
const LaborCostPage = lazy(() => import("@/pages/tools-pages").then((module) => ({ default: module.LaborCostPage })));
const OvertimePage = lazy(() => import("@/pages/tools-pages").then((module) => ({ default: module.OvertimePage })));
const TipPoolPage = lazy(() => import("@/pages/tools-pages").then((module) => ({ default: module.TipPoolPage })));
const FoodCostPage = lazy(() => import("@/pages/tools-pages").then((module) => ({ default: module.FoodCostPage })));
const MenuPricePage = lazy(() => import("@/pages/tools-pages").then((module) => ({ default: module.MenuPricePage })));
const PrimeCostPage = lazy(() => import("@/pages/tools-pages").then((module) => ({ default: module.PrimeCostPage })));
const BreakEvenPage = lazy(() => import("@/pages/tools-pages").then((module) => ({ default: module.BreakEvenPage })));
const TimeCardPage = lazy(() => import("@/pages/tools-pages").then((module) => ({ default: module.TimeCardPage })));
const ComparePage = lazy(() => import("@/pages/compare-pages").then((module) => ({ default: module.ComparePage })));
const SwitchPage = lazy(() => import("@/pages/compare-pages").then((module) => ({ default: module.SwitchPage })));
const ReferralsPage = lazy(() => import("@/pages/referrals-page").then((module) => ({ default: module.ReferralsPage })));
const TermsPage = lazy(() => import("@/pages/legal-pages").then((module) => ({ default: module.TermsPage })));
const PrivacyPolicyPage = lazy(() => import("@/pages/legal-pages").then((module) => ({ default: module.PrivacyPolicyPage })));
const CookiesPolicyPage = lazy(() => import("@/pages/legal-pages").then((module) => ({ default: module.CookiesPolicyPage })));
const HowItWorksPage = lazy(() => import("@/pages/how-it-works-page").then((module) => ({ default: module.HowItWorksPage })));
const TermsPageEn = lazy(() => import("@/pages/legal-en").then((module) => ({ default: module.TermsPageEn })));
const PrivacyPageEn = lazy(() => import("@/pages/legal-en").then((module) => ({ default: module.PrivacyPageEn })));
const CookiesPageEn = lazy(() => import("@/pages/legal-en").then((module) => ({ default: module.CookiesPageEn })));


function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { token, me, isLoading, hasExplicitLogoutGuard } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();
  const effectiveToken = hasExplicitLogoutGuard ? null : token;
  const effectiveMe = hasExplicitLogoutGuard ? null : me;

  if (isLoading) {
    return <div className="p-6 text-center text-[var(--color-text-muted)]">{t("common.loading")}</div>;
  }

  if (!effectiveToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (effectiveMe && !effectiveMe.is_linked) {
    return <Navigate to="/pending-link" replace />;
  }
  if (!effectiveMe) {
    // Signed in but the profile did not load: never show a half-empty app.
    return <AccountLoadError />;
  }

  return children;
}

function AccountLoadError() {
  const { refreshMe, logout } = useAuth();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--color-bg)] px-6 text-center">
      <div className="ios-island max-w-sm px-6 py-8">
        <p className="text-[20px] font-semibold text-black">{t("app.load_error_title")}</p>
        <p className="mt-2 text-[15px] text-[#3c3c43]">{t("app.load_error_body")}</p>
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await refreshMe();
              } catch {
                // stays on this screen
              } finally {
                setBusy(false);
              }
            }}
            className="min-h-11 rounded-full bg-[var(--color-primary-strong)] px-5 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {t("app.try_again")}
          </button>
          <button type="button" onClick={() => void logout()} className="min-h-11 rounded-full px-5 text-[15px] font-semibold text-[var(--color-primary-strong)]">
            {t("shell.log_out")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <span className="size-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
    </div>
  );
}

function AuthBootstrapScreen() {
  const { t } = useLanguage();
  return <div className="flex min-h-screen items-center justify-center p-6 text-center text-[var(--color-text-muted)]">{t("common.loading")}</div>;
}

function ADMINRoute({ children }: { children: JSX.Element }) {
  const { me } = useAuth();
  if (me?.role !== "ADMIN") {
    return <Navigate to={me?.role === "MANAGER" && canAccessReport(me) ? "/overview/revenue" : "/schedule"} replace />;
  }
  return children;
}

function OverviewRoute({ children }: { children: JSX.Element }) {
  const { me } = useAuth();
  if (!canViewOverview(me)) return <Navigate to={me?.role === "MANAGER" && canAccessReport(me) ? "/overview/revenue" : "/schedule"} replace />;
  return children;
}

function ReportAccessRoute({ children }: { children: JSX.Element }) {
  const { me } = useAuth();
  if (!canAccessReport(me)) return <Navigate to="/schedule" replace />;
  return children;
}

function TeamAccessRoute({ children }: { children: JSX.Element }) {
  const { me } = useAuth();
  if (!canManageTeam(me)) return <Navigate to="/schedule" replace />;
  return children;
}

function NotesAccessRoute({ children }: { children: JSX.Element }) {
  const { me } = useAuth();
  if (!canAccessNotes(me)) return <Navigate to="/overview" replace />;
  return children;
}

function PayrollAccessRoute({ children }: { children: JSX.Element }) {
  const { me } = useAuth();
  if (!hasPlanFeature(me, "payroll")) return <Navigate to="/schedule" replace />;
  if (me?.role === "STAFF" || me?.role === "ADMIN") return children;
  if (me?.role === "MANAGER" && canViewPayroll(me)) return children;
  return <Navigate to="/schedule" replace />;
}

export function App() {
  const { token, me, isLoading, hasExplicitLogoutGuard } = useAuth();
  const effectiveToken = hasExplicitLogoutGuard ? null : token;
  const effectiveMe = hasExplicitLogoutGuard ? null : me;
  const hasUnresolvedSession = Boolean(effectiveToken && !effectiveMe);
  const linkedDefaultRoute = effectiveMe?.is_linked ? getHomeRoute(effectiveMe) : effectiveMe ? "/pending-link" : "/login";

  if (isLoading) {
    return <AuthBootstrapScreen />;
  }

  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route
        path="/"
        element={effectiveToken && effectiveMe ? <Navigate to={linkedDefaultRoute} replace /> : hasUnresolvedSession ? <PendingLinkPage /> : <EnglishOnly><LandingPage /></EnglishOnly>}
      />
      <Route
        path="/pl"
        element={effectiveToken && effectiveMe ? <Navigate to={linkedDefaultRoute} replace /> : hasUnresolvedSession ? <PendingLinkPage /> : <PolishOnly><LandingPage /></PolishOnly>}
      />
      <Route
        path="/login"
        element={effectiveToken && effectiveMe ? <Navigate to={linkedDefaultRoute} replace /> : hasUnresolvedSession ? <PendingLinkPage /> : <LoginPage />}
      />
      <Route
        path="/join"
        element={effectiveToken && effectiveMe ? <Navigate to={linkedDefaultRoute} replace /> : hasUnresolvedSession ? <PendingLinkPage /> : <LoginPage />}
      />
      <Route path="/demo" element={effectiveToken && effectiveMe ? <Navigate to={linkedDefaultRoute} replace /> : <DemoPage />} />
      <Route path="/kiosk" element={<KioskPage />} />
      <Route path="/how-it-works" element={<EnglishOnly><HowItWorksPage /></EnglishOnly>} />
      <Route path="/tools" element={<EnglishOnly><ToolsHubPage /></EnglishOnly>} />
      <Route path="/compare/:slug" element={<EnglishOnly><ComparePage /></EnglishOnly>} />
      <Route path="/switch" element={<EnglishOnly><SwitchPage /></EnglishOnly>} />
      <Route path="/tools/restaurant-schedule-template" element={<EnglishOnly><ScheduleTemplatePage /></EnglishOnly>} />
      <Route path="/tools/labor-cost-calculator" element={<EnglishOnly><LaborCostPage /></EnglishOnly>} />
      <Route path="/tools/overtime-calculator" element={<EnglishOnly><OvertimePage /></EnglishOnly>} />
      <Route path="/tools/tip-pool-calculator" element={<EnglishOnly><TipPoolPage /></EnglishOnly>} />
      <Route path="/tools/food-cost-calculator" element={<EnglishOnly><FoodCostPage /></EnglishOnly>} />
      <Route path="/tools/menu-price-calculator" element={<EnglishOnly><MenuPricePage /></EnglishOnly>} />
      <Route path="/tools/prime-cost-calculator" element={<EnglishOnly><PrimeCostPage /></EnglishOnly>} />
      <Route path="/tools/restaurant-break-even-calculator" element={<EnglishOnly><BreakEvenPage /></EnglishOnly>} />
      <Route path="/tools/time-card-calculator" element={<EnglishOnly><TimeCardPage /></EnglishOnly>} />
      <Route path="/terms" element={<EnglishOnly><TermsPageEn /></EnglishOnly>} />
      <Route path="/privacy" element={<EnglishOnly><PrivacyPageEn /></EnglishOnly>} />
      <Route path="/cookies" element={<EnglishOnly><CookiesPageEn /></EnglishOnly>} />
      <Route path="/regulamin" element={<TermsPage />} />
      <Route path="/polityka-prywatnosci" element={<PrivacyPolicyPage />} />
      <Route path="/polityka-cookies" element={<CookiesPolicyPage />} />
      <Route
        path="/pending-link"
        element={
          !effectiveToken ? (
            <Navigate to="/login" replace />
          ) : effectiveMe?.is_linked ? (
            <Navigate to={linkedDefaultRoute} replace />
          ) : (
            <PendingLinkPage />
          )
        }
      />

      <Route path="/overview" element={<ProtectedRoute><OverviewRoute><DashboardPage /></OverviewRoute></ProtectedRoute>} />
      <Route path="/overview/revenue" element={<ProtectedRoute><ReportAccessRoute><ReportPage /></ReportAccessRoute></ProtectedRoute>} />
      <Route path="/report" element={<Navigate to="/overview/revenue" replace />} />
      <Route path="/reports" element={<Navigate to="/overview" replace />} />

      <Route path="/schedule" element={<ProtectedRoute><SchedulePage section="calendar" /></ProtectedRoute>} />
      <Route path="/schedule/availability" element={<ProtectedRoute><SchedulePage section="availability" /></ProtectedRoute>} />
      <Route path="/schedule/requests" element={<ProtectedRoute><SchedulePage section="requests" /></ProtectedRoute>} />
      <Route
        path="/schedule/hours"
        element={<ProtectedRoute>{hasPlanFeature(effectiveMe, "timesheets") ? <SchedulePage section="hours" /> : <Navigate to="/settings/billing" replace />}</ProtectedRoute>}
      />
      <Route path="/timesheets" element={<Navigate to="/schedule/hours" replace />} />

      <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
      <Route path="/start" element={<ProtectedRoute><StartPage /></ProtectedRoute>} />

      <Route path="/team" element={<ProtectedRoute><TeamAccessRoute><TeamPage section="people" /></TeamAccessRoute></ProtectedRoute>} />
      <Route path="/team/invites" element={<ProtectedRoute><TeamAccessRoute><TeamPage section="invites" /></TeamAccessRoute></ProtectedRoute>} />
      <Route path="/team/positions" element={<ProtectedRoute><TeamAccessRoute><TeamPage section="positions" /></TeamAccessRoute></ProtectedRoute>} />
      <Route path="/team/locations" element={<ProtectedRoute><TeamAccessRoute><TeamPage section="locations" /></TeamAccessRoute></ProtectedRoute>} />
      <Route path="/team/templates" element={<ProtectedRoute><TeamAccessRoute><TeamPage section="templates" /></TeamAccessRoute></ProtectedRoute>} />
      <Route path="/team/permissions" element={<ProtectedRoute><ADMINRoute><TeamPage section="permissions" /></ADMINRoute></ProtectedRoute>} />

      <Route path="/payroll" element={<ProtectedRoute><PayrollAccessRoute><PayrollPage /></PayrollAccessRoute></ProtectedRoute>} />

      <Route path="/settings" element={<ProtectedRoute><SettingsPage section="profile" /></ProtectedRoute>} />
      <Route path="/settings/business" element={<ProtectedRoute><SettingsPage section="business" /></ProtectedRoute>} />
      <Route path="/settings/calendar" element={<ProtectedRoute><SettingsPage section="calendar" /></ProtectedRoute>} />
      <Route path="/settings/billing" element={<ProtectedRoute><ADMINRoute><BillingPage /></ADMINRoute></ProtectedRoute>} />
      <Route path="/settings/referrals" element={<ProtectedRoute><ADMINRoute><ReferralsPage /></ADMINRoute></ProtectedRoute>} />
      <Route path="/profile" element={<Navigate to="/settings" replace />} />
      <Route path="/billing" element={<Navigate to="/settings/billing" replace />} />

      <Route path="/notes" element={<ProtectedRoute><NotesAccessRoute><NotesDocumentsPage /></NotesAccessRoute></ProtectedRoute>} />
      <Route path="/inventory" element={<Navigate to={effectiveToken ? linkedDefaultRoute : "/"} replace />} />
      {/* The admin panel has its own sign-in (email code + authenticator app), separate from business accounts. */}
      <Route path="/platform/login" element={<PlatformLoginPage />} />
      <Route path="/platform" element={<PlatformGuard><PlatformPage /></PlatformGuard>} />
      <Route path="/platform/support" element={<PlatformGuard><PlatformSupportPage /></PlatformGuard>} />

      <Route path="/home" element={<Navigate to="/overview" replace />} />
      <Route path="/dashboard" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to={effectiveToken ? linkedDefaultRoute : "/"} replace />} />
    </Routes>
    {effectiveToken && effectiveMe ? <ProductTour /> : null}
    {effectiveToken && effectiveMe ? <SupportLauncher /> : null}
    </Suspense>
  );
}

