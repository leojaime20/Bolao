import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { LanguageProvider } from './i18n/LanguageContext'
import { AuthProvider } from './hooks/useAuth'
import { PoolProvider } from './hooks/usePools'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import App from './App.jsx'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: `Copa-Yantai@${APP_VERSION}`,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.2,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <PoolProvider>
            <App />
          </PoolProvider>
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>,
)
