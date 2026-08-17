# APEX 1368×753 Desktop Viewport Contract

## Canonical frame

| Region | Size |
|---|---:|
| Browser CSS viewport | 1368 × 753 px |
| Left navigation | 184 px |
| Application stage | 1184 px |
| Global header | 58 px |
| Content height below header | 695 px |
| Overview ticker strip row | 72 px |
| Overview workspace row | 623 px |
| Order/risk context column | 286 px |
| Toolbox rail | 48 px |
| Expanded toolbox drawer | 306 px |
| Main internal gap | 9 px |
| Overview activity panel | 132 px |

## Scroll ownership

The browser document must not scroll on Overview at 1368×753. Scroll is allowed only in intentional data regions:

- order/risk context column when its advanced controls are expanded;
- activity table body;
- toolbox drawer body;
- long tables on secondary routes;
- page canvas on secondary routes when data density exceeds the viewport.

## Scaling rules

- No CSS `zoom` is used.
- SVG charts use `viewBox` and `preserveAspectRatio="none"` so the chart follows its container.
- Layout dimensions are controlled by CSS custom properties and grid tracks.
- At 1024–1279 CSS px, navigation labels collapse before the right context tools are removed.
- At widths above 1450px, existing fluid clamps expand spacing and card widths without changing the information hierarchy.

## Layer order

| Layer | Purpose | Recommended z-index |
|---|---|---:|
| Base canvas | page background | 0 |
| Content cards | charts, tables, forms | 1 |
| Sticky table/header surfaces | local navigation | 3–5 |
| Toolbox rail | always available context tools | 10 |
| Expanded toolbox drawer | contextual workflow | 11 |
| Modal/confirmation | destructive or authenticated action | 30+ |
| Toast/status feedback | non-blocking system feedback | 40+ |

## Visual tokens

| Token | Value |
|---|---|
| Canvas | `#F7FAF8` |
| Surface | `#FFFFFF` |
| Soft surface | `#FBFDFB` |
| Standard border | `#DFE8E2` |
| Strong border | `#CDDBD2` |
| Primary text | `#13213A` |
| Muted text | `#708098` |
| APEX green | `#24B844` |
| Dark green | `#159337` |
| Soft green | `#EAF8EC` |
| Informational blue | `#377CF3` |
| Analytical violet | `#8B5CF6` |
| Warning amber | `#F59E0B` |
| Loss/error red | `#EF5350` |
| Panel radius | `14px` |
| Control radius | `11px` |
| Panel shadow | `0 5px 18px rgba(23,57,35,.035)` |
