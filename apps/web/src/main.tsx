import "@fontsource-variable/nunito";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { App } from "@/App";
import { captureTestLoginKey } from "@/components/dev-login-button";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/lib/i18n";
import { ErrorBoundary } from "@/components/error-boundary";
import { RouteError } from "@/components/route-error";
import { installStaleBuildRecovery } from "@/lib/stale-build";
import { captureReferral } from "@/lib/referral";
import { installErrorReporting } from "@/lib/error-reporting";
import { registerServiceWorker } from "@/lib/pwa";
import { ToastProvider } from "@/lib/toast";
import "@/styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // Data stays fresh for 30 s, so moving between tabs doesn't refetch everything every time.
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

// A data router, so screens with unsaved changes can stop navigation (useBlocker). App keeps its own <Routes>.
const router = createBrowserRouter([{ path: "*", element: <App />, errorElement: <RouteError /> }]);

captureTestLoginKey();
registerServiceWorker();
installErrorReporting();
installStaleBuildRecovery();
captureReferral();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
