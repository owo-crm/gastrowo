import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { canAccessInventory, canAccessNotes, canAccessReport, canManageTeam, canViewOverview } from "@/lib/access";
import { DashboardPage } from "@/pages/dashboard-page";
import { BillingPage } from "@/pages/billing-page";
import { InventoryPage } from "@/pages/inventory-page";
import { LandingPage } from "@/pages/landing-page";
import { LoginPage } from "@/pages/login-page";
import { NotesDocumentsPage } from "@/pages/notes-documents-page";
import { PendingLinkPage } from "@/pages/pending-link-page";
import { ProfilePage } from "@/pages/profile-page";
import { ReportPage } from "@/pages/report-page";
import { SchedulePage } from "@/pages/schedule-page";
import { TasksPage } from "@/pages/tasks-page";
import { TeamPage } from "@/pages/team-page";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { token, me, isLoading } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();

  if (isLoading) {
    return <div className="p-6 text-center text-[var(--color-text-muted)]">{t("common.loading")}</div>;
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (me && !me.is_linked) {
    return <Navigate to="/pending-link" replace />;
  }

  return children;
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
  if (me?.role === "ADMIN") return <Navigate to="/overview" replace />;
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

function InventoryAccessRoute({ children }: { children: JSX.Element }) {
  const { me } = useAuth();
  if (!canAccessInventory(me)) return <Navigate to="/overview" replace />;
  return children;
}

export function App() {
  const { token, me } = useAuth();
  const linkedDefaultRoute = me?.is_linked
    ? me?.role === "ADMIN"
      ? "/overview"
      : me?.role === "MANAGER"
        ? canViewOverview(me)
          ? "/overview"
          : "/report"
        : "/schedule"
    : "/pending-link";

  return (
    <Routes>
      <Route path="/" element={token ? <Navigate to={linkedDefaultRoute} replace /> : <LandingPage />} />
      <Route path="/login" element={token ? <Navigate to={linkedDefaultRoute} replace /> : <LoginPage />} />
      <Route path="/join" element={token ? <Navigate to={linkedDefaultRoute} replace /> : <LoginPage />} />
      <Route
        path="/pending-link"
        element={
          !token ? <Navigate to="/login" replace /> : me?.is_linked ? <Navigate to={linkedDefaultRoute} replace /> : <PendingLinkPage />
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
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <InventoryAccessRoute>
              <InventoryPage />
            </InventoryAccessRoute>
          </ProtectedRoute>
        }
      />
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
      <Route path="*" element={<Navigate to={token ? linkedDefaultRoute : "/"} replace />} />
    </Routes>
  );
}

