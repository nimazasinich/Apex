# APEX Backtesting Lab — Claude Desktop Production Implementation Brief

## Role

You are working directly inside the existing **APEX trading platform codebase**.

Your task is to redesign and implement the **Backtesting Lab** page using the attached visual reference while preserving **100% of the existing functional capability** of the application.

This is a **production implementation task**, not a static mockup exercise.

---

# 1. PRIMARY VISUAL REFERENCE

The attached Backtesting Lab screenshot is the **PRIMARY VISUAL REFERENCE** for this implementation.

Use the attached file:

`apex_backtesting_lab_dashboard.png`

Treat this image as the visual source of truth for:

- overall layout hierarchy
- panel proportions
- Evidence Area composition
- spacing
- density
- button hierarchy
- status presentation
- workflow feedback
- card grouping
- information hierarchy
- interaction affordances

Do **not** redesign the page from imagination.

Do **not** merely use the reference as vague inspiration.

Reconstruct the intended design in the real application using maintainable HTML/React/CSS/layout primitives.

The **existing APEX codebase is the functional source of truth**.

The **attached reference image is the visual source of truth**.

Your job is to merge both correctly.

---

# 2. NON-NEGOTIABLE FEATURE PRESERVATION

## ZERO FEATURE LOSS

No existing feature may be removed, disabled, bypassed, hidden permanently, or replaced with a non-functional visual substitute.

This requirement is absolute.

During implementation:

- preserve every existing control
- preserve every existing workflow
- preserve every existing route
- preserve every existing form field
- preserve every existing state transition
- preserve every existing backtesting capability
- preserve every existing validation rule
- preserve every existing backend-connected action
- preserve every existing loading state
- preserve every existing error state
- preserve every existing success state
- preserve existing export behavior
- preserve existing fullscreen behavior
- preserve preset behavior
- preserve reset behavior
- preserve Run Backtest behavior
- preserve strategy selection
- preserve market selection
- preserve timeframe selection
- preserve requested-period handling
- preserve direction controls
- preserve risk-profile controls
- preserve strategy parameters
- preserve cost assumptions
- preserve result/evidence behavior
- preserve run history and evidence-related functionality

If an existing feature is visually repositioned, it must remain fully functional.

If the reference image does not visibly show an existing feature, **do not delete the feature**.

Instead:

1. find an appropriate location for it,
2. preserve its behavior,
3. integrate it cleanly into the redesigned interface.

---

# 3. BACKEND SAFETY — CRITICAL

## EXISTING BACKEND CODE MUST REMAIN INTACT

Do not damage, remove, bypass, or arbitrarily rewrite existing backend/business logic.

Before making UI changes, inspect the existing:

- API services
- API routes
- request payloads
- response payloads
- backtesting services
- data-access layers
- hooks
- stores
- context providers
- validation logic
- result models
- TypeScript interfaces/types
- runtime status models
- error models
- loading states
- replay/backtesting orchestration
- data availability checks
- fingerprint/provenance logic
- export behavior
- run-history behavior

Preserve existing contracts wherever possible.

## BACKEND MAY BE EXTENDED WHEN NECESSARY

If the redesigned interface requires functionality or structured data that the current backend genuinely does not expose, you are allowed to:

- extend an existing backend endpoint
- add a compatible backend field
- add a new endpoint if truly necessary
- add a new service method
- add a new status field
- add additional validation
- add missing result metadata
- add a missing persistence/read pathway

BUT:

- do not delete existing backend behavior
- do not replace existing endpoints unnecessarily
- do not rename stable API contracts purely for UI convenience
- do not remove fields that other components may depend on
- do not break backward compatibility without a demonstrated technical reason
- do not rewrite working trading logic for cosmetic reasons

Any backend change must be **additive or safely evolutionary**.

The goal is:

**preserve → extend if necessary → integrate**

Never:

**delete → simplify → fake**

---

# 4. NO MOCK FUNCTIONALITY

The redesigned page must be genuinely functional.

Do not create fake UI behavior.

Do not hardcode fake performance metrics.

Do not hardcode fake completed backtests.

Do not create fake backend responses.

Do not create fake progress percentages unless the backend actually supports that progress state.

Do not show a success state merely because a button was clicked.

Do not fabricate:

- canonical results
- chart points
- fingerprint values
- warnings
- data availability
- run duration
- evidence confidence
- historical trades
- performance metrics
- export availability

Every dynamic value shown in the interface must come from:

1. the existing backend/state,
2. a real deterministic frontend calculation already supported by the product,
3. or a newly implemented real backend/frontend pathway.

If data does not exist, render a truthful state such as:

- Not run
- Pending
- Unavailable
- Waiting for result
- No results yet
- Validation required

---

# 5. TARGET RESOLUTION

Primary QA viewport:

**1368 × 753 px**

This resolution is mandatory.

Do not stretch the application to fake a match.

Do not scale the entire UI.

Do not distort proportions.

Use real responsive layout techniques:

- CSS Grid
- Flexbox
- minmax()
- clamp() where appropriate
- controlled internal scrolling
- container-aware sizing

Scrolling is allowed where useful.

At 1368×753:

- no critical button may be clipped
- no form field may become unusable
- no card may unintentionally overflow
- no unexpected horizontal page scrollbar
- no Evidence Area clipping
- no stretched cards
- no giant unused dead zones
- no overlapping controls
- all important controls must remain reachable

---

# 6. BASE LAYOUT SPECIFICATION

## Viewport

- Width: `1368px`
- Height: `753px`

## Sidebar

Approximate target:

- x: `0`
- y: `0`
- width: `172px`
- height: `753px`

Do not redesign the global sidebar unless required to preserve alignment.

## Top Header

Approximate target:

- x: `172px`
- y: `0`
- width: `1196px`
- height: `56px`

Preserve global header behavior and status indicators.

## Main Area

Approximate target:

- x: `172px`
- y: `56px`
- width: `1196px`
- height: `697px`

Page horizontal padding:

- approximately `12px`

Effective inner width:

- approximately `1172px`

## Workspace

Main workspace begins at approximately:

- `y: 128px`

Recommended desktop structure:

```css
grid-template-columns: 390px minmax(0, 1fr);
gap: 12px;
```

Left column:
- approximately `390px`

Right Evidence Area:
- receives remaining width
- should visually dominate

---

# 7. DESIGN TOKENS

First inspect the current APEX token/theme system.

Reuse existing variables whenever equivalent tokens already exist.

Do not duplicate the theme system.

If a local page-specific token is needed, align it with these targets.

## Core colors

```text
Page background:        #F7F9FC
Primary surface:        #FFFFFF
Secondary surface:      #F8FAFC

Border:                 #DCE5ED
Strong border:          #CBD8E4

Primary text:           #0F213A
Secondary text:         #52657A
Muted text:             #7C8DA0

Primary green:          #16A34A
Green hover:            #138A3E
Green pressed:          #107735
Soft green surface:     #EFFAF2
Soft green border:      #BFE5C9

Blue accent:            #2563EB
Soft blue:              #EEF5FF

Amber:                  #C27A0A
Soft amber:             #FFF7E8

Danger:                 #DC4854
Soft danger:            #FFF1F2

Purple/info accent:     #7C5CE5
```

Avoid:

- neon styling
- extreme saturation
- glassmorphism everywhere
- huge shadows
- excessive gradients

The page should look like a credible professional trading platform.

---

# 8. SURFACES

Primary card:

```css
background: #FFFFFF;
border: 1px solid #DCE5ED;
border-radius: 12px;
box-shadow: 0 1px 2px rgba(15, 33, 58, 0.035);
```

Elevated interactive section:

```css
box-shadow: 0 4px 14px rgba(15, 33, 58, 0.055);
```

Sub-panels:

- radius: `10px`

Inputs/selects:

- radius: `8–10px`

Buttons:

- radius: `8–10px`

Status pills:

- radius: `999px`

---

# 9. SPACING SYSTEM

Prefer this spacing scale:

```text
4
6
8
10
12
16
20
24
```

Recommended:

- main card padding: `12–16px`
- section gap: `12px`
- compact form gap: `8–10px`
- control group gap: `8px`

Do not introduce random spacing values without a layout reason.

---

# 10. TYPOGRAPHY

Reuse the existing APEX font stack.

Do not introduce a new web-font dependency.

Recommended scale:

```text
Page title:              22px / 28px, 650–700
Evidence hero title:     16–18px, 650–700
Panel title:             13–14px, 650
Control values:          11–12px
Input labels:            10–11px, 550–600
Helper text:             10–11px
Metadata:                 9–10px
```

Avoid excessively bold numbers.

---

# 11. CONFIGURE REPLAY PANEL

The left panel remains the configuration workspace.

It may use **internal vertical scrolling**.

Do not force every setting above the fold.

Recommended hierarchy:

1. Configure Replay header
2. Ready/state badge
3. Strategy selector
4. Strategy classification chips
5. Market
6. Timeframe
7. Requested period
8. History bars
9. Maximum hold
10. Direction
11. Display capital
12. Risk profile
13. Strategy Parameters
14. Cost Assumptions
15. Validation/readiness summary
16. Action footer

Suggested action footer:

- Save Preset
- Reset
- Run Backtest

If current functionality includes additional controls, retain them.

---

# 12. CONTROL DIMENSIONS

Recommended target dimensions:

```text
Input/select:            34–36px
Segmented control:       34px
Primary button:          36–38px
Utility button:          30–34px
Icon button:             32–34px square
Chip/tag:                20–22px
```

Primary Run Backtest:

- minimum width: approximately `150px`
- height: `36–38px`

---

# 13. BUTTON INTERACTION STATES

Every action must provide visible feedback.

Primary action:

Default:
- green background
- white label

Hover:
- darker green

Pressed:
- darker/pressed treatment

Focus:
- visible accessible focus ring

Disabled:
- visibly disabled
- no deceptive hover
- correct disabled semantics

Loading:
- spinner/progress visual
- meaningful label such as:
  `Running Backtest…`

Success:
- only after real success state is received

Error:
- show actionable error feedback

Do not use animations that block interaction.

---

# 14. EVIDENCE AREA — PRIMARY REDESIGN FOCUS

The Evidence Area should become the main visual and informational focus.

It must feel:

- active
- trustworthy
- state-aware
- useful
- product-grade
- data-driven

It must never feel like a large decorative empty container.

---

# 15. EVIDENCE AREA STRUCTURE

## A. Evidence Header

Approximate height:

`42–48px`

Left:

- Evidence Area
- supporting description

Right:

- Export
- Full screen

Export must reflect real export availability.

Do not enable Export when no exportable result exists.

---

## B. Replay Identity Row

Approximate height:

`48–54px`

Display real data such as:

- status
- strategy
- market
- timeframe
- direction
- fingerprint state

Keep metadata concise.

---

## C. Metric Summary

Use compact metric cards/cells.

Possible fields:

- Bars
- Max hold
- Run time
- Generated
- Data source
- Warnings
- confidence/readiness only if genuinely supported

Before a run, truthful examples include:

```text
0 / 2,000
72 bars
—
Not run
Unavailable
0
Pending
```

Do not fabricate result data.

---

# 16. EVIDENCE HERO

This is the strongest visual section.

Approximate target height:

`170–190px`

Recommended:

- soft green/blue surface
- subtle border
- strong status icon/illustration
- clear state headline
- concise explanation
- next-step sequence
- primary CTA

Layout:

```css
display: grid;
grid-template-columns: minmax(190px, 42%) minmax(0, 58%);
gap: 16px;
padding: 16px;
```

Illustration target:

- width: `220–270px`
- height: `120–150px`

Do not allow illustration to dominate the interface.

---

# 17. ATTACHED SVG ASSETS

Use the provided SVG assets when helpful.

Recommended project destination:

`src/assets/backtesting/`

Assets:

## `apex-evidence-engine.svg`

Use in the primary Evidence hero.

## `apex-empty-results.svg`

Use for empty/no-result state.

## `apex-ready-status.svg`

Use for a large ready/verified state when appropriate.

Rules:

- do not convert SVG to base64
- do not add a new dependency just for SVG rendering
- use the project's current asset import convention
- preserve accessible alt text if rendered as images
- existing icon components should still be used for standard UI controls

---

# 18. EVIDENCE HERO CONTENT

Example ready state:

**Ready to run your backtest**

Supporting message:

`Your configuration is valid and the required inputs are available.`

Possible truthful sequence:

1. Server validates configuration and data
2. Backtest executes against requested historical bars
3. Canonical results and evidence become available
4. Metrics, charts and trades can be reviewed

These are process descriptions.

Do not mark any step completed unless actual application state confirms completion.

---

# 19. WORKFLOW FEEDBACK

Add a clear step strip:

**Configure → Run → Review**

Approximate height:

`48–54px`

States:

Completed:
- green

Current:
- green/blue emphasized

Pending:
- neutral

Derive each visual state from real application state.

---

# 20. RESULT TABS

Recommended:

- Output Overview
- Evidence Notes
- Run History

Approximate height:

`40–44px`

Active tab:

- clear green accent/underline

Hover:

- subtle neutral/green tint

Tabs must remain functional.

Do not create non-functional tab chrome.

---

# 21. PRE-RUN LOWER CONTENT

Do not use a massive blank box.

Before results exist, show useful real information.

Recommended two-column section:

## Key Information

Potential values:

- Market / Direction
- Timeframe / Bars
- Required data tier
- Round-trip cost model
- Expected outputs
- Prerequisites

## Evidence Status

Potential rows:

- Data Availability
- Fingerprint
- Result Set
- Chart Data

Each must map to real state.

---

# 22. VISUAL FEEDBACK

Design and implement all relevant states:

- default
- hover
- focused
- selected
- pressed
- disabled
- loading
- validating
- ready
- running
- warning
- error
- success
- pending
- empty
- completed
- unavailable

Examples:

LONG selected:
- green selected treatment

Balanced selected:
- green/soft-green treatment

Backtest running:
- Run action enters loading state
- workflow updates
- relevant status components update

Backend error:
- clear error state
- actionable message
- do not leave UI indefinitely loading

---

# 23. FRONTEND/BACKEND SYNCHRONIZATION

Every major interactive element must be wired to the real application behavior.

Before implementing the redesigned controls, map:

```text
UI control
→ current event handler
→ state/update layer
→ API/service
→ backend response
→ resulting UI state
```

Do not build a beautiful second UI layer disconnected from the application's actual state.

If an existing component already performs an action, preserve and reuse the handler.

Do not create duplicate competing state.

---

# 24. WHEN BACKEND WORK IS REQUIRED

If the redesigned UI exposes a state that currently exists conceptually but has no clean backend representation:

1. inspect the backend first,
2. verify the state is genuinely missing,
3. add the smallest compatible backend capability,
4. update types/contracts,
5. wire the frontend to it,
6. test both sides.

Backend additions must be production-oriented.

Examples of acceptable additions:

- explicit run-status metadata
- fingerprint-status metadata
- result-availability metadata
- export-readiness status
- evidence-status endpoint/field
- validated warning structure

Only add them if the current backend does not already provide equivalent information.

---

# 25. DO NOT DELETE CODE TO MAKE THE REDESIGN EASIER

Never delete a functional feature because it does not fit the new layout.

Never comment out existing behavior as a shortcut.

Never hide an existing feature permanently.

Never replace a difficult feature with placeholder text.

Never remove backend calls simply to make the UI compile.

If integration is difficult:

**fix the integration.**

---

# 26. IMPLEMENTATION WORKFLOW

Do not immediately rewrite the entire page.

Proceed in this order:

1. Inspect the Backtesting Lab route
2. Inspect its main page component
3. Inspect child components
4. Inspect page-specific CSS/styles
5. Inspect shared components/tokens
6. Inspect API/hooks/state
7. Record existing feature inventory
8. Map every feature to the reference layout
9. Implement layout structure
10. Integrate existing functionality
11. Extend backend only if required
12. Verify type safety
13. Verify runtime behavior
14. QA at 1368×753

---

# 27. FEATURE INVENTORY CHECKPOINT

Before destructive editing, create an internal checklist of all currently available Backtesting Lab features.

After implementation, compare the new screen against that list.

Completion criterion:

**feature count after redesign >= feature count before redesign**

No previously working capability may disappear.

If the redesign introduces genuinely useful new behavior, it may increase the feature set.

It must never reduce it.

---

# 28. CHANGE SCOPE

Unless required for this page, do not alter:

- trading execution logic
- live order submission
- portfolio logic
- authentication
- unrelated research pages
- unrelated routes
- global navigation behavior
- unrelated global styles
- market-data architecture
- unrelated responsive layouts

Keep implementation scoped.

---

# 29. CODE QUALITY

Prefer:

- existing components
- existing hooks
- existing services
- existing tokens
- existing icon package
- maintainable CSS
- scoped styles
- small reusable page subcomponents
- typed state
- explicit loading/error state

Avoid:

- giant monolithic component rewrites
- `!important` chains unless absolutely necessary
- duplicated API clients
- duplicated models
- hardcoded pixel hacks across many selectors
- global CSS regressions
- unnecessary dependencies

---

# 30. 1368×753 VISUAL QA

After implementation, launch the real app.

Use Playwright or existing browser automation.

Set viewport exactly:

```text
width: 1368
height: 753
```

Validate:

- sidebar alignment
- top header alignment
- page title
- top navigation controls
- Configure Replay width
- Evidence Area dominance
- internal scroll
- no horizontal page overflow
- no card clipping
- no button clipping
- no overlapping elements
- readable labels
- reachable Run Backtest
- Evidence hero proportions
- status feedback
- tabs
- inputs
- dropdowns
- action footer

Use screenshots for comparison against the visual reference.

---

# 31. FUNCTIONAL QA

Test every existing relevant feature.

At minimum verify:

- strategy selection
- strategy metadata/chips
- market selection
- timeframe selection
- requested period
- history bars
- maximum hold
- LONG/SHORT selection
- display capital
- risk profile
- strategy parameter editing
- cost assumption editing
- Save Preset
- Reset
- Run Backtest
- loading state
- validation state
- backend error state
- successful result state when available
- Evidence Area update
- Evidence Notes
- Run History
- Export state
- Full screen behavior
- warning rendering
- data availability rendering
- fingerprint rendering

If additional features already exist in the current page, test those too.

---

# 32. BACKEND REGRESSION QA

If backend code is changed:

- run existing backend tests
- run type checks
- run API/service tests if available
- verify prior response fields remain intact
- verify old consumers are not broken
- verify no endpoint behavior is accidentally removed

Do not claim success merely because frontend compilation passes.

---

# 33. NO FALSE COMPLETION CLAIMS

Do not report the redesign complete until all of the following have genuinely succeeded:

1. UI implementation
2. existing feature preservation
3. frontend/backend integration
4. type/lint validation
5. runtime application launch
6. 1368×753 visual QA
7. functional interaction QA
8. backend regression QA if backend was touched
9. confirmation that no existing feature was lost
10. confirmation that no unrelated feature was broken

---

# 34. FINAL REPORT

When finished, report:

## Files changed
List each modified file.

## Frontend changes
Summarize UI/layout/component updates.

## Backend changes
List any backend changes.
If none were necessary, explicitly say so.

## Preserved functionality
Confirm existing features remained intact.

## Added functionality
List only genuinely implemented additions.

## Verification
Report:

- lint/type check
- tests
- application launch
- 1368×753 screenshot QA
- interaction checks

## Known limitations
Do not hide unresolved issues.

---

# FINAL PRINCIPLE

The target is not merely:

**"make the Backtesting Lab look like the reference."**

The target is:

**Preserve the entire existing APEX Backtesting Lab feature set, redesign it to match the attached professional visual reference, keep all frontend/backend behavior real and functional, safely extend backend capability only when genuinely necessary, and verify the finished application at exactly 1368×753 without regressions.**

No functionality may be sacrificed for appearance.
