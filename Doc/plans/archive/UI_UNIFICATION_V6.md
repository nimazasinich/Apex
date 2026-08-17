# APEX UI Unification V6

This release extends the soft-green APEX design language across the full workspace.

## Updated pages

- Markets
- Watchlist
- Portfolio
- Trading
- Orders
- Positions
- Alerts
- History
- Analytics
- Settings

## Design system changes

- Shared page hero with a page-specific accent, icon, eyebrow, title, subtitle and refresh action.
- Shared compact status strip for account, monitoring and settings pages.
- Consistent panel borders, shadows, headers, dividers and hover states.
- Unified tables, empty states, activity rows, forms and focus feedback.
- Page-specific accents without breaking the main soft-green brand language.
- Consistent responsive behavior and reduced-motion support.
- Existing Overview layout, wider order ticket, reliable coin icon fallback chain and micro-interactions are preserved.

## Validation

- TypeScript/TSX syntax transpilation completed for all source files.
- `src/index.css` parsed successfully with PostCSS.
- No `vendor-motion` manual chunk remains in `vite.config.ts`.
