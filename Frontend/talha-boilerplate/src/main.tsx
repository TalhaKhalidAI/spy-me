import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom'
import { queryClient } from './api/http/query.ts'
import { QueryClientProvider } from '@tanstack/react-query';
import { MyToastContainer } from './api/ReactToastify.tsx'
import { ThemeProvider } from './context/ThemeContext';
import * as Sentry from "@sentry/react";
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';

Sentry.init({
  dsn: (import.meta as unknown as { env: Record<string, string> }).env.VITE_SENTRY_DSN || "",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <GlobalErrorBoundary>
          <MyToastContainer />
          <App />
        </GlobalErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  </BrowserRouter>
);
