# APEX UI Design Token Fix — v1.0.38

## Scope

This release fixes the proven missing design-token import that caused APEX reference pages to render with transparent icon tints, inherited dark icon/text colors, and missing semantic borders.

## Root cause

`src/styles/tokens.css` existed, but `src/index.css` did not import it. Components referenced variables such as:

```css
var(--apex-green-050)
var(--apex-green-300)
var(--apex-green-600)
var(--apex-muted-600)
var(--apex-border)
```

Without the stylesheet import, those custom properties were absent from the runtime cascade. Declarations with unresolved variables became invalid, producing transparent or inherited visual states across Help, Settings, Alerts, Positions, Orders, and Watchlist.

## Fixes applied

### 1. Activated the token stylesheet

Added exactly once, before all `@layer` rules:

```css
@import "tailwindcss" source("./");
@import "./styles/tokens.css";
```

### 2. Completed the token contract

Added the missing intermediate green shades used by active page styles:

```css
--apex-green-300
--apex-green-400
--apex-green-800
```

Added stable semantic aliases used by shared UI primitives:

```css
--apex-positive
--apex-negative
--apex-focus
--apex-soft
```

No existing token values were replaced.

### 3. Added a release-blocking static contract

Added:

```text
scripts/qa/verifyDesignTokens.mjs
npm run qa:design-tokens
```

The main `npm run verify` chain now fails if:

- `tokens.css` is absent;
- the import is missing or duplicated;
- the import appears after style rules;
- required palette or semantic tokens are missing;
- a remote import is introduced into the token stylesheet.

### 4. Added browser-runtime regression coverage

Extended:

```text
scripts/qa/verifyWorkspaceRuntime.mts
```

The existing Playwright QA now verifies in forced Light and Dark modes at `1368×753` that:

- required APEX custom properties resolve to non-empty computed values;
- Help topic icon tint backgrounds are not transparent;
- Help topic icon colors are not transparent;
- Help search highlight borders are not transparent;
- runtime screenshots are captured for the token contract.

### 5. Version and handoff

- Package version updated to `1.0.38` in `package.json` and `package-lock.json`.
- `PROJECT_HANDOFF.md` updated with exact changes and validation status.

## Exact files changed

```text
src/index.css
src/styles/tokens.css
scripts/qa/verifyWorkspaceRuntime.mts
package.json
package-lock.json
PROJECT_HANDOFF.md
```

## Exact files added

```text
scripts/qa/verifyDesignTokens.mjs
APEX_UI_TOKEN_FIX_REPORT_v1.0.38.md
QA/design-token-contract-v1.0.38.json
```

## Validation completed in this environment

```text
Design token static contract: PASS (5/5)
Reference UI QA: PASS (24/24)
UI interaction QA: PASS (28/28)
Strategy Library QA: PASS
Strategy Engines QA: PASS
Strategy Integration QA: PASS
Adaptive Governor QA: PASS
System Integration QA: PASS (12/12)
TypeScript isolated syntax transpile: PASS (274 TS/TSX/MTS/CTS files)
CSS structural validation: PASS (26 files)
Undefined APEX CSS variables: 0
Package/package-lock version consistency: PASS
Source-only secret gate: PASS
```

Known baseline static findings retained from v1.0.37:

```text
Backtesting Workspace QA: 24/25 — Settings columns placement expectation
Consolidation QA: 13/15 — disconnected workspace client and duplicate-path findings
```

## Dependency-backed validation status

`npm ci` was attempted, but the configured environment registry returned HTTP 404 for:

```text
why-is-node-running@2.3.0
```

Consequently, full dependency-backed TypeScript, Vitest, production build, and Playwright runtime execution could not be completed in this container. The browser-runtime regression test is included and wired into `verify:visual`, but must be executed on a machine with working registry access.

Required final commands:

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```
