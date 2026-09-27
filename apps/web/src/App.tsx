import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { canAccessNotes, canAccessReport, canManageTeam, canViewOverview, canViewPayroll, hasPlanFeature } from "@/lib/access";
import { LandingPage } from "@/pages/landing-page";
import { LoginPage } from "@/pages/login-page";
import { PendingLinkPage } from "@/pages/pending-link-page";
import { useAuth } from "@/lib/auth";
import { getHomeRoute } from "@/lib/navigation";
import { useLanguage } from "@/lib/i18n";

// App pages load on demand so the landing and login stay small.
const DashboardPage = lazy(() => import("@/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })));
const BillingPage = lazy(() => import("@/pages/billing-page").then((module) => ({ default: module.BillingPage })));
const NotesDocumentsPage = lazy(() => import("@/pages/notes-documents-page").then((module) => ({ default: module.NotesDocumentsPage })));
const PayrollPage = lazy(() => import("@/pages/payroll-page").then((module) => ({ default: module.PayrollPage })));
const ProfilePage = lazy(() => import("@/pages/profile-page").then((module) => ({ default: module.ProfilePage })));
const ReportPage = lazy(() => import("@/pages/report-page").then((module) => ({ default: module.ReportPage })));
const SchedulePage = lazy(() => import("@/pages/schedule-page").then((module) => ({ default: module.SchedulePage })));
const TasksPage = lazy(() => import("@/pages/tasks-page").then((module) => ({ default: module.TasksPage })));
const TeamPage = lazy(() => import("@/pages/team-page").then((module) => ({ default: module.TeamPage })));
const WaitlistPage = lazy(() => import("@/pages/waitlist-page").then((module) => ({ default: module.WaitlistPage })));
const TermsPage = lazy(() => import("@/pages/legal-pages").then((module) => ({ default: module.TermsPage })));
const PrivacyPolicyPage = lazy(() => import("@/pages/legal-pages").then((module) => ({ default: module.PrivacyPolicyPage })));
const CookiesPolicyPage = lazy(() => import("@/pages/legal-pages").then((module) => ({ default: module.CookiesPolicyPage })));


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

  return children;
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
    return <Navigate to={me?.role === "MANAGER" ? "/report" : "/schedule"} replace />;
  }
  return children;
}

function OverviewRoute({ children }: { children: JSX.Element }) {
  const { me } = useAuth();
  if (!canViewOverview(me)) return <Navigate to={me?.role === "MANAGER" ? "/report" : "/schedule"} replace />;
  return children;
}

function ReportAccessRoute({ children }: { children: JSX.Element }) {
  const { me } = useAuth();
  if (!canAccessReport(me)) return <Navigate to="/schedule" replace />;
  return children;
}

function TeamAccessRoute({ children }: { children: JSX.Element }) {
  const { me } = useAuth();
  if (!canManageTeam(me)) return <Navigate to="/overview" replace />;
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
        element={effectiveToken && effectiveMe ? <Navigate to={linkedDefaultRoute} replace /> : hasUnresolvedSession ? <PendingLinkPage /> : <LandingPage />}
      />
      <Route
        path="/login"
        element={effectiveToken && effectiveMe ? <Navigate to={linkedDefaultRoute} replace /> : hasUnresolvedSession ? <PendingLinkPage /> : <LoginPage />}
      />
      <Route
        path="/join"
        element={effectiveToken && effectiveMe ? <Navigate to={linkedDefaultRoute} replace /> : hasUnresolvedSession ? <PendingLinkPage /> : <LoginPage />}
      />
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

      <Route
        path="/overview"
        element={
          <ProtectedRoute>
            <OverviewRoute>
              <DashboardPage />
            </OverviewRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/report"
        element={
          <ProtectedRoute>
            <ReportAccessRoute>
              <ReportPage />
            </ReportAccessRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <SchedulePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/timesheets"
        element={
          <ProtectedRoute>
            {hasPlanFeature(effectiveMe, "timesheets") ? <SchedulePage /> : <Navigate to="/schedule" replace />}
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <TasksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute>
            <TeamAccessRoute>
              <TeamPage />
            </TeamAccessRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payroll"
        element={
          <ProtectedRoute>
            <PayrollAccessRoute>
              <PayrollPage />
            </PayrollAccessRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Navigate to="/overview" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notes"
        element={
          <ProtectedRoute>
            <NotesAccessRoute>
              <NotesDocumentsPage />
            </NotesAccessRoute>
          </ProtectedRoute>
        }
      />
      <Route path="/inventory" element={<Navigate to={effectiveToken ? linkedDefaultRoute : "/"} replace />} />
      <Route
        path="/billing"
        element={
          <ProtectedRoute>
            <ADMINRoute>
              <BillingPage />
            </ADMINRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/waitlist"
        element={
          <ProtectedRoute>
            <ADMINRoute>
              <WaitlistPage />
            </ADMINRoute>
          </ProtectedRoute>
        }
      />

      <Route path="/home" element={<Navigate to="/overview" replace />} />
      <Route path="/dashboard" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to={effectiveToken ? linkedDefaultRoute : "/"} replace />} />
    </Routes>
    </Suspense>
  );
}

