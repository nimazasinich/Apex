export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

export function browserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showBrowserNotification(title: string, body: string): boolean {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return false;
  if (document.visibilityState === 'visible') return false;
  try {
    const notification = new Notification(title, {
      body,
      icon: '/apex-logo.svg',
      tag: `apex-alert:${title}:${body}`,
    });
    notification.onclick = () => {
      window.focus();
      window.location.hash = '#/alerts';
      notification.close();
    };
    window.setTimeout(() => notification.close(), 12_000);
    return true;
  } catch {
    return false;
  }
}

export function playAlertTone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return false;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(940, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
    oscillator.addEventListener('ended', () => void context.close());
    return true;
  } catch {
    return false;
  }
}
