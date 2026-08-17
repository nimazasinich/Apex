# Strategy Studio UI Implementation

## Scope
A new visual-only `Strategies` workspace was added to the APEX left navigation and routed through `#/strategies`.

## UI structure
- Collections rail with strategy groups, quick filters, and Research Book card.
- Strategy Studio heading and summary cards.
- Primary composite-strategy evidence card with metrics, logic flow, equity curve, configuration, and actions.
- Model Shelf with additional strategy candidates.
- Right-side insight rail with ranking, validation mix, regime coverage, daily winner, and APEX score gauge.

## Reference geometry
The Strategies workspace uses a fixed logical composition of `1690 × 931` and applies independent horizontal and vertical transforms at runtime. This preserves the reference frame without cropping or padding at the project target viewport, including `1368 × 753`.

## Main files
- `src/pages/strategies/StrategyPage.tsx`
- `src/pages/strategies/StrategyPage.css`
- `src/components/workspace/WorkspaceShell.tsx`
- `src/App.tsx`
- `src/main.tsx`

## Functional boundary
This delivery implements the requested strategy interface only. Strategy actions are presentation controls and are not connected to a new backend strategy engine.
