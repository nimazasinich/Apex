import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import './styles/workspace-shell.css';
import './styles/reference-ui.css';
import App from './App.tsx';
import { RouteErrorBoundary } from './components/ui/RouteErrorBoundary';
import { registerApexServiceWorker } from './lib/serviceWorkerUpdates';
import './styles/interaction-polish.css';
import './styles/light-theme-hardening.css';
import './styles/light-theme-workspace-refinement.css';
import './components/trading/TradingWorkspace.css';
import { initializeTheme } from './lib/theme';

initializeTheme();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void registerApexServiceWorker().catch((error) => {
      console.warn('[APEX] Service worker registration failed', error);
    });
  });
}


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouteErrorBoundary route="application shell" resetKey="application-shell">
      <App />
    </RouteErrorBoundary>
  </StrictMode>,
);
