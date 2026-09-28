import "@fontsource-variable/nunito";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { App } from "@/App";
import { captureTestLoginKey } from "@/components/dev-login-button";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/lib/i18n";
import { ToastProvider } from "@/lib/toast";
import "@/styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // Data stays fresh for 30 s, so moving between tabs doesn't refetch everything every time.
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

captureTestLoginKey();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
