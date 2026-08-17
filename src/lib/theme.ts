export const THEME_STORAGE_KEY = 'apex_theme_v1';
export const THEME_CHANGE_EVENT = 'apex:theme-change';
export const THEME_COLOR_BY_RESOLVED = { light: '#31b94d', dark: '#071019' } as const;

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const VALID_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
let detachSystemListener: (() => void) | null = null;

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && VALID_PREFERENCES.includes(value as ThemePreference);
}

export function readThemePreference(storage: Pick<Storage, 'getItem'> | null = typeof window !== 'undefined' ? window.localStorage : null): ThemePreference {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyThemeToDocument(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
  prefersDark = systemPrefersDark(),
): ResolvedTheme {
  const resolved = resolveTheme(preference, prefersDark);
  root.dataset.apexTheme = preference;
  root.dataset.apexThemeResolved = resolved;
  root.style.colorScheme = resolved;
  const ownerDocument = root.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  const themeColor = ownerDocument?.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColor?.setAttribute('content', THEME_COLOR_BY_RESOLVED[resolved]);
  return resolved;
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  if (!isThemePreference(preference)) throw new TypeError(`Unsupported theme preference: ${String(preference)}`);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme remains usable when storage is unavailable (privacy mode/quota).
  }
  const resolved = applyThemeToDocument(preference);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference, resolved } }));
  return resolved;
}

export function initializeTheme(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  detachSystemListener?.();
  const preference = readThemePreference();
  applyThemeToDocument(preference);

  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  const onSystemChange = (event: MediaQueryListEvent | MediaQueryList) => {
    const current = readThemePreference();
    if (current !== 'system') return;
    const resolved = applyThemeToDocument(current, document.documentElement, event.matches);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference: current, resolved } }));
  };

  media?.addEventListener?.('change', onSystemChange);
  // Safari < 14 fallback, kept without any dependency on deprecated typings.
  const legacyMedia = media as MediaQueryList & { addListener?: (listener: (event: MediaQueryListEvent) => void) => void; removeListener?: (listener: (event: MediaQueryListEvent) => void) => void } | null;
  if (!media?.addEventListener) legacyMedia?.addListener?.(onSystemChange);

  detachSystemListener = () => {
    media?.removeEventListener?.('change', onSystemChange);
    if (!media?.removeEventListener) legacyMedia?.removeListener?.(onSystemChange);
    if (detachSystemListener) detachSystemListener = null;
  };
  return detachSystemListener;
}
