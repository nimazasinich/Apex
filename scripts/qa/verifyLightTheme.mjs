#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];
const check = (name, passed, detail = '') => checks.push({ name, passed: Boolean(passed), detail });

const main = read('src/main.tsx');
const indexCss = read('src/index.css');
const tokens = read('src/styles/tokens.css');
const hardening = read('src/styles/light-theme-hardening.css');
const shell = read('src/components/workspace/WorkspaceShell.tsx');
const referenceUi = read('src/pages/referenceUi.tsx');
const html = read('index.html');
const themeInit = exists('public/theme-init.js') ? read('public/theme-init.js') : '';
const backtestingCss = read('src/pages/backtesting/BacktestingPage.css');
const serviceWorker = read('public/sw.js');
const runtimeQa = read('scripts/qa/verifyWorkspaceRuntime.mts');
const pkg = JSON.parse(read('package.json'));

const canonicalImports = [
  "import './index.css';",
  "import './styles/workspace-shell.css';",
  "import './styles/reference-ui.css';",
  "import './styles/interaction-polish.css';",
  "import './styles/light-theme-hardening.css';",
];
let previous = -1;
let ordered = true;
for (const statement of canonicalImports) {
  const index = main.indexOf(statement);
  if (index < 0 || index <= previous) ordered = false;
  previous = index;
}
check('canonical stylesheet order', ordered, 'Tokens → shell → page UI → interaction → light hardening.');
check('no component shell CSS import', !shell.includes("styles/workspace-shell.css"), 'Shell CSS is not injected conditionally by a component chunk.');
check('no page reference CSS import', !referenceUi.includes("styles/reference-ui.css"), 'Reference CSS is loaded once from the entry point.');
check('token import exists', indexCss.includes('@import "./styles/tokens.css";'), 'APEX design variables are available before page CSS.');
check('local Inter font', indexCss.includes('@import "@fontsource/inter/400.css";') && indexCss.includes('@import "@fontsource/inter/700.css";'), 'Inter is bundled locally.');
check('local mono font', indexCss.includes('@import "@fontsource/jetbrains-mono/400.css";') && indexCss.includes('@import "@fontsource/jetbrains-mono/600.css";'), 'JetBrains Mono is bundled locally.');
check('no external Google font dependency', !/fonts\.(?:googleapis|gstatic)\.com/i.test(html), 'Light UI typography cannot fail because of a blocked external font request.');
// The pre-paint bootstrap moved out of index.html into an external same-origin
// file so the page satisfies `script-src 'self'` without 'unsafe-inline'. The
// contract is unchanged and is now checked in two parts: the logic still
// resolves the stored theme before paint, and index.html still loads it
// synchronously in <head> (no defer/async/module, which would run post-paint).
const themeScriptTag = /<script(?![^>]*\b(?:defer|async|type=)\b)[^>]*src=["']\/theme-init\.js["'][^>]*>/i.test(
  html.slice(0, html.search(/<\/head>/i) === -1 ? html.length : html.search(/<\/head>/i)),
);
check(
  'pre-paint theme bootstrap',
  themeInit.includes("localStorage.getItem('apex_theme_v1')")
    && themeInit.includes('root.dataset.apexThemeResolved = resolved')
    && themeScriptTag,
  'Theme is resolved before React paints, from a same-origin script loaded synchronously in <head>.',
);
check('explicit light contract', hardening.includes(':root[data-apex-theme-resolved="light"]'), 'Light mode is not dependent on generic :root inheritance alone.');
check('light canvas and surface', hardening.includes('--apex-canvas: #f7faf8;') && hardening.includes('--apex-surface: #ffffff;'), 'Canvas and card surfaces are explicit.');
check('light readable text', hardening.includes('--apex-ink-900: #14233a;') && hardening.includes('--apex-muted-600: #627087;'), 'Primary and secondary text remain readable.');
check('semantic text tokens', ['--apex-green-text:', '--apex-red-text:', '--apex-amber-text:', '--apex-blue-text:'].every((token) => hardening.includes(token)), 'Status text does not reuse low-contrast decorative colors.');
check('legacy muted copy normalized', hardening.includes('.apex-panel-head small') && hardening.includes('.apex-mkt2-metric small') && hardening.includes('.strategy-insight-card p'), 'Secondary copy across Overview, Markets and Strategy uses the readable muted token.');
check('light V20 contract', ['--v20-surface:', '--v20-border:', '--v20-text:', '--v20-muted:'].every((token) => hardening.includes(token)), 'Split reference pages share the light contract.');
check('avatar legacy black removed', hardening.includes('.apex-shell .apex-avatar') && hardening.includes('background: var(--apex-green-100) !important;'), 'Header avatar uses the APEX tint.');
check('visible focus contract', hardening.includes('outline: 2px solid var(--apex-focus) !important;') && hardening.includes('outline-offset: 2px !important;'), 'Keyboard focus is visible on light surfaces.');
check('forced colors support', hardening.includes('@media (forced-colors: active)'), 'High-contrast OS mode retains focus visibility.');
check('increased contrast support', hardening.includes('@media (prefers-contrast: more)'), 'Borders and muted text strengthen when requested.');
check('light ambient blobs disabled', hardening.includes('.app-shell::before') && hardening.includes('display: none;'), 'Legacy dark ambient blobs cannot tint the light workspace.');
check('backtesting token resolved', !backtestingCss.includes('--bt-surface-soft') && backtestingCss.includes('background: var(--bt-soft);'), 'Backtesting no longer references an undefined surface variable.');
check('required green scale complete', ['--apex-green-050:', '--apex-green-100:', '--apex-green-200:', '--apex-green-300:', '--apex-green-400:', '--apex-green-500:', '--apex-green-600:', '--apex-green-700:', '--apex-green-800:'].every((token) => tokens.includes(token)), 'Tinted icons and highlights have a complete scale.');
check('service worker cache version', serviceWorker.includes(`const APP_VERSION = '${pkg.version}'`) && serviceWorker.includes('const CACHE_NAME = `apex-shell-v${APP_VERSION}-${BUILD_HASH}`'), 'Old CSS is separated by release and build identity.');
check('package version is valid semver and synchronized by the release gate', /^\d+\.\d+\.\d+$/.test(pkg.version), `package.json=${pkg.version}`);
check('QA wired into verify', pkg.scripts?.['qa:light-theme'] === 'node scripts/qa/verifyLightTheme.mjs' && (pkg.scripts?.verify?.includes('npm run qa:light-theme') || pkg.scripts?.['check:source-contracts']?.includes('npm run qa:light-theme')), 'The active verification chain catches a regression.');
check('all workspace routes covered at runtime', ['overview','markets','watchlist','portfolio','trading','orders','positions','alerts','history','analytics','backtesting','strategies','settings','help'].every((route) => runtimeQa.includes(`route: '${route}'`)), 'The browser contract checks every active route in forced Light mode.');
check('hardening file exists', exists('src/styles/light-theme-hardening.css'), 'Release light-theme layer is present.');

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
function luminance(hex) {
  return hexToRgb(hex).map((channel) => channel / 255).map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}
const pairs = [
  ['muted text/canvas', '#627087', '#f7faf8', 4.5],
  ['V20 muted/soft', '#627087', '#f3f7f4', 4.5],
  ['green status/white', '#14752e', '#ffffff', 4.5],
  ['red status/white', '#bd2f3c', '#ffffff', 4.5],
  ['amber status/white', '#805500', '#ffffff', 4.5],
  ['primary ink/canvas', '#14233a', '#f7faf8', 7],
];
for (const [name, foreground, background, minimum] of pairs) {
  const ratio = contrast(foreground, background);
  check(`contrast:${name}`, ratio >= minimum, `${ratio.toFixed(2)}:1 (minimum ${minimum}:1)`);
}

const failed = checks.filter((item) => !item.passed);
const report = {
  generatedAt: new Date().toISOString(),
  version: pkg.version,
  baselineViewport: '1368x753',
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
};
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, `QA/light-theme-release-v${packageVersion}.json`), `${JSON.stringify(report, null, 2)}\n`);
for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
console.log(`\n${checks.length - failed.length}/${checks.length} light-theme checks passed`);
if (failed.length) process.exit(1);
