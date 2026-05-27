import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { canAccessNotes, canAccessReport, canManageTeam, canViewOverview, canViewPayroll } from "@/lib/access";
import { DashboardPage } from "@/pages/dashboard-page";
import { BillingPage } from "@/pages/billing-page";
import { LandingPage } from "@/pages/landing-page";
import { LoginPage } from "@/pages/login-page";
import { NotesDocumentsPage } from "@/pages/notes-documents-page";
import { PendingLinkPage } from "@/pages/pending-link-page";
import { PayrollPage } from "@/pages/payroll-page";
import { ProfilePage } from "@/pages/profile-page";
import { ReportPage } from "@/pages/report-page";
import { SchedulePage } from "@/pages/schedule-page";
import { TasksPage } from "@/pages/tasks-page";
import { TeamPage } from "@/pages/team-page";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";

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
  if (me?.role === "STAFF" || me?.role === "ADMIN") return children;
  if (me?.role === "MANAGER" && canViewPayroll(me)) return children;
  return <Navigate to="/schedule" replace />;
}

export function App() {
  const { token, me, isLoading, hasExplicitLogoutGuard } = useAuth();
  const effectiveToken = hasExplicitLogoutGuard ? null : token;
  const effectiveMe = hasExplicitLogoutGuard ? null : me;
  const hasUnresolvedSession = Boolean(effectiveToken && !effectiveMe);
  const linkedDefaultRoute = effectiveMe?.is_linked
    ? effectiveMe.role === "ADMIN"
      ? "/overview"
      : effectiveMe.role === "MANAGER"
        ? canViewOverview(effectiveMe)
          ? "/overview"
          : "/report"
        : "/schedule"
    : effectiveMe
      ? "/pending-link"
      : "/login";

  if (isLoading) {
    return <AuthBootstrapScreen />;
  }

  return (
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

      <Route path="/home" element={<Navigate to="/overview" replace />} />
      <Route path="/dashboard" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to={effectiveToken ? linkedDefaultRoute : "/"} replace />} />
    </Routes>
  );
}

