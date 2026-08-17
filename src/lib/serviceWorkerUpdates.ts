export const SERVICE_WORKER_UPDATE_EVENT = 'apex:service-worker-update';

export interface ServiceWorkerUpdateDetail {
  registration: ServiceWorkerRegistration;
}

function announceWaitingWorker(registration: ServiceWorkerRegistration) {
  window.dispatchEvent(new CustomEvent<ServiceWorkerUpdateDetail>(SERVICE_WORKER_UPDATE_EVENT, {
    detail: { registration },
  }));
}

export async function registerApexServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.register('/sw.js');
  if (registration.waiting) announceWaitingWorker(registration);

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller && registration.waiting) {
        announceWaitingWorker(registration);
      }
    });
  });
}
