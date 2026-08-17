import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { SERVICE_WORKER_UPDATE_EVENT, type ServiceWorkerUpdateDetail } from '../../lib/serviceWorkerUpdates';

export function ServiceWorkerUpdateBanner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const reloadOnControlRef = useRef(false);

  useEffect(() => {
    const onUpdate = (event: Event) => setRegistration((event as CustomEvent<ServiceWorkerUpdateDetail>).detail.registration);
    const onControllerChange = () => {
      if (reloadOnControlRef.current) window.location.reload();
    };
    window.addEventListener(SERVICE_WORKER_UPDATE_EVENT, onUpdate);
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);
    return () => {
      window.removeEventListener(SERVICE_WORKER_UPDATE_EVENT, onUpdate);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!registration) return null;
  return (
    <aside className="apex-update-banner" role="status" aria-live="polite">
      <div><strong>APEX update available</strong><span>Reload when you are not reviewing or confirming an order.</span></div>
      <button type="button" className="apex-primary-button" onClick={() => {
        reloadOnControlRef.current = true;
        registration.waiting?.postMessage({ type: 'APEX_ACTIVATE_UPDATE' });
      }}><RefreshCw size={15} /> Reload safely</button>
      <button type="button" className="apex-icon-button" aria-label="Dismiss update notice" onClick={() => setRegistration(null)}><X size={15} /></button>
    </aside>
  );
}
