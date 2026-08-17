/**
 * Pre-paint theme resolution.
 *
 * Must run synchronously in <head>, before first paint, to avoid a
 * light/dark flash. Kept as an external same-origin file (rather than an
 * inline <script>) so the page satisfies `script-src 'self'` without
 * needing 'unsafe-inline' or a per-build hash.
 *
 * Do not convert this back to an inline script: it is blocked by CSP in
 * production and the theme flash returns.
 */
(() => {
  const applyTheme = (preference, resolved) => {
    const root = document.documentElement;
    root.dataset.apexTheme = preference;
    root.dataset.apexThemeResolved = resolved;
    root.style.colorScheme = resolved;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#071019' : '#31b94d');
  };

  const prefersDark = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  try {
    const stored = localStorage.getItem('apex_theme_v1');
    const preference =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    const resolved = preference === 'system' ? (prefersDark() ? 'dark' : 'light') : preference;
    applyTheme(preference, resolved);
  } catch {
    // localStorage can throw in private mode / blocked-cookie contexts.
    applyTheme('system', prefersDark() ? 'dark' : 'light');
  }
})();
