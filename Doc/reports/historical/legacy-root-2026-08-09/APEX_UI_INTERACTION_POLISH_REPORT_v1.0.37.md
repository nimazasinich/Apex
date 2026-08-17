# APEX UI Interaction & Feedback Polish Report — v1.0.37

## Scope

This release continues the existing APEX terminal without replacing its architecture. The UI work is designed around the canonical **1368×753** viewport and focuses on detail quality, feedback clarity, keyboard use, selected states, safe action handoff, and Light/Dark parity.

No order payload, API contract, financial calculation, route name, storage key, scanner gate, strategy engine, or execution rule was changed.

## Global workspace improvements

### Canonical shell activation

The active `WorkspaceShell` now carries both required classes:

```text
apex-shell apex-workspace
```

This activates the existing canonical shell rules instead of leaving part of the UI under legacy fallback styling.

### Global feedback center

A new event-driven feedback layer provides:

- success, information, warning and error states;
- accessible `status` and `alert` announcements;
- optional contextual action;
- explicit dismissal;
- bounded stacking and duplicate suppression;
- automatic cleanup;
- reduced-motion compatibility;
- Light/Dark theme compatibility.

### Header and navigation interaction

- Added a persisted Light/Dark theme toggle.
- Added Home/End keyboard navigation to global search.
- Synchronized mouse-hover and keyboard active results.
- Added an explicit global-search clear action.
- Added complete combobox/listbox semantics.
- Made Market Data status actionable in the header and sidebar.
- Added explicit account-settings labeling to the avatar control.
- Added visible focus states and consistent pressed/hover feedback.

## Page-level improvements

### Watchlist

- Removed side effects from state-updater callbacks to remain safe under React StrictMode.
- Added clear favorite-add/remove feedback.
- Kept selection synchronized with visible filtered results.
- Added accessible tab semantics and keyboard row selection.
- Added an explicit search clear action.
- Connected the selected symbol to Trading without fabricating market data.

### Orders

- Added safe refresh feedback.
- Added one-action filter reset with active-filter count.
- Added full order-ID copying with success/failure feedback.
- Added row selection by mouse and keyboard.
- Added explicit selected-order clearing.
- Added duplicate and replacement-draft feedback with a direct Trading action.
- Kept cancellation confirmation, active-environment disclosure and error reporting.
- Made inline order messages dismissible.

### Positions

- Preserved all eleven financial table columns.
- Added sorting by P&L, position value, leverage and liquidation risk.
- Added selectable rows with keyboard support.
- Replaced decorative action dots with a working “Open in Trading” action.
- Added a Position Focus panel with P&L, return, mark/entry and liquidation gap.
- Aggregated Exposure by Asset across all verified position notionals.
- Improved snapshot states for loading, error, Live lock and ready conditions.
- Replaced the misleading `Daily P&L` label with the exact `Account Unrealized` snapshot value.
- Kept page overflow controlled while allowing table-local scrolling when necessary.

### Alerts

- Added rule editing and update flow.
- Added builder reset and selected-rule loading.
- Added create/update/delete/toggle/template feedback.
- Added deletion confirmation and rule-name validation.
- Added accessible switch semantics (`role="switch"`, `aria-checked`).
- Added keyboard row selection and explicit alert-search clearing.

### History

- Added deterministic CSV filename reporting and download feedback.
- Corrected download cleanup by removing the temporary anchor and revoking the object URL.
- Added filter reset and refresh feedback.
- Clamped pagination after filter changes.
- Added tab semantics and keyboard row selection.

### Settings

- Added retriable server-security bootstrap state.
- Added saved/unsaved preference detection.
- Disabled save actions when there are no changes.
- Added reset actions for unsaved Trading and Notification preferences.
- Kept local preference state synchronized with the parent settings source.
- Surfaced inline Settings messages through the global feedback center.
- Preserved all seven sections:
  - Account
  - Security
  - Appearance
  - Notifications
  - Trading preferences
  - API management
  - Connected devices

### Help

- Refactored System Health into a reusable refresh function.
- Added manual refresh with success/error feedback while retaining periodic refresh.
- Added Escape-key handling for tutorial and support dialogs.
- Added autofocus to modal close controls.
- Added diagnostic-template copy feedback.
- Replaced the unsupported `24/7` availability statement with deployment-safe support language.

## Styling and accessibility

A new narrowly scoped stylesheet, `src/styles/interaction-polish.css`, adds:

- focus-visible rings;
- selected row states;
- hover/active micro-interactions;
- clearer status and feedback typography;
- context-card and metric-card refinement;
- table interaction feedback;
- Dark mode parity;
- reduced-motion handling;
- responsive behavior around the 1368×753 baseline.

The proven-unreachable legacy file below was removed after repository-wide import verification:

```text
src/styles/v3-workspace.css
```

Its obsolete static test now reads the active split page styles and canonical workspace shell.

## Added files

```text
scripts/qa/verifyUiInteractionPolish.mjs
src/components/ui/WorkspaceFeedbackCenter.css
src/components/ui/WorkspaceFeedbackCenter.tsx
src/lib/workspaceFeedback.ts
src/styles/interaction-polish.css
APEX_UI_INTERACTION_POLISH_REPORT_v1.0.37.md
```

## Modified files

```text
package.json
package-lock.json
PROJECT_HANDOFF.md
src/App.tsx
src/components/workspace/WorkspaceShell.tsx
src/main.tsx
src/pages/alerts/AlertsPage.tsx
src/pages/help/HelpPage.tsx
src/pages/history/HistoryPage.tsx
src/pages/orders/OrdersPage.tsx
src/pages/pageTypes.ts
src/pages/positions/PositionsPage.tsx
src/pages/settings/SettingsPage.tsx
src/pages/watchlist/WatchlistPage.tsx
src/styles/workspace-shell.css
tests/v3-contract-static.mjs
```

## Validation results

```text
TypeScript isolated syntax transpile: PASS — 209 TS/TSX/MTS files
UI interaction polish QA: PASS — 28/28
Reference UI redesign QA: PASS — 24/24
V3 static layout contract: PASS
Strategy Library QA: PASS
Strategy Engines smoke QA: PASS
Strategy Integration QA: PASS
Adaptive Governor QA: PASS
System Integration QA: PASS — 12/12
CSS structural validation: PASS — 26 files
Package and lock JSON parse: PASS
Source-only release secret gate: PASS
```

## Existing baseline findings

The following were reproduced in the v1.0.36 baseline and were not introduced by this UI release:

```text
Backtesting Workspace QA: 24/25
- existing Settings-column placement expectation

Consolidation QA: 13/15
- existing disconnected workspace client finding
- existing duplicate-path finding
```

## Dependency-backed checks not claimed

The supplied `node_modules` tree is incomplete, and the configured dependency installation previously failed with a registry 404. Therefore, this environment could not truthfully complete:

```text
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

No runtime screenshot or browser-layout result is claimed for v1.0.37. Those checks should run after a clean install on the target machine.

## Target-machine release gate

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

Then inspect the primary interactive pages in forced Light and Dark modes at:

```text
1280×720
1368×753
1440×900
1920×1080
Effective 200% zoom
```
