# APEX V31 — Secondary Page Visual Upgrade 1.0.31

## Scope

This pass upgrades four pages that were visually flatter than the established Portfolio, Orders and Analytics standard:

- Settings
- History
- Alerts
- Help

No trading, account, alert-rule, history-export, security-bootstrap or API-connection logic was replaced. The changes are page-level UI composition and CSS-module improvements, plus small markup additions for icons and visual hierarchy.

## Settings

- Color-coded configuration modules with independent icon treatments.
- Stronger active-state hierarchy and section-specific accent colors.
- Premium Demo/Live environment cards.
- Improved Security Status, Account Health and Recommended Steps context cards.
- Page remains constrained to the 1368×753 desktop contract.

## History

- Gradient audit header and verified-stream badge.
- Five color-coded metric cards.
- Visual activity-type badges for order, trade, position, deposit, withdrawal, transfer and funding records.
- Improved timeline icons, export card and data-state presentation.
- Existing filtering, CSV export, pagination and WorkspaceInsights data source remain unchanged.

## Alerts

- Purple/amber monitoring identity with a live rule-engine badge.
- Color-coded rule metrics and richer table rows.
- Direction icons, readiness tags, score visualization and trigger counters.
- Enhanced Smart Alert Builder, Recent Triggers and Quick Templates panels.
- Existing browser persistence and rule evaluation logic remain unchanged.

## Help

- Full visual support-center hero with icon cluster.
- Color-coded help topics.
- Improved FAQ cards and tutorial thumbnails.
- Distinct Live Chat, Email Support and Ticket actions.
- Color-coded System Status and Announcements context panels.

## Validation

- TypeScript/TSX syntax: passed for all 4 changed page modules.
- CSS parsing: passed for all 4 changed CSS modules.
- Reference UI static QA: 24/24.
- Consolidation static QA: 15/15.
- System Integration static QA: 12/12.

## Runtime limitation

A clean dependency install could not complete in this environment because the configured internal npm registry returned a 404 for `why-is-node-running@2.3.0`. Therefore the included 1368×753 images are deterministic static visual fixtures produced from the exact updated page CSS modules and representative markup; they are not presented as a live backend/API runtime capture.
