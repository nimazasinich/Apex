# APEX Backtesting Lab — Claude Desktop UI Refactor Brief

## Task

Refactor and improve the **existing APEX Backtesting Lab UI** to match the attached reference image.

This is **NOT a rewrite from scratch**.

Do not rebuild the page architecture unnecessarily.
Do not replace working components just to make implementation easier.
Use the existing Backtesting Lab components, state, hooks, services, handlers, API calls, backend contracts, and business logic wherever they already work.

The goal is:

**existing working Backtesting Lab → targeted UI/UX refactor → match attached reference → preserve 100% functionality**

---

# Visual Reference

The attached image:

`apex_backtesting_lab_dashboard.png`

is the **primary visual reference**.

Use it as the source of truth for:

- layout
- proportions
- spacing
- card hierarchy
- Evidence Area design
- controls
- buttons
- visual feedback
- information density

Do not redesign from imagination.

---

# ONLY TARGET RESOLUTION

The only resolution that matters for this task is:

# 1368 × 753

Optimize specifically and exclusively for this viewport.

Do not spend time building additional breakpoints unless the existing code already needs them to remain intact.

Do not stretch the interface.

Do not scale the whole page.

Use proper CSS Grid/Flexbox sizing.

Scrolling is allowed.

At exactly 1368×753:

- no critical clipping
- no horizontal page overflow
- no overlapping controls
- no distorted cards
- no oversized blank areas
- all important actions remain reachable
- internal panel scrolling is acceptable

---

# CRITICAL — PRESERVE ALL FUNCTIONALITY

No existing feature may be lost.

Do NOT remove, disable, fake, permanently hide, or bypass any existing feature.

Preserve all current behavior including, where currently implemented:

- strategy selection
- market selection
- timeframe
- requested period
- history bars
- maximum hold
- LONG / SHORT
- display capital
- risk profile
- strategy parameters
- cost assumptions
- preset handling
- reset
- Run Backtest
- validation
- loading
- errors
- results
- evidence
- warnings
- fingerprint/provenance
- export
- fullscreen
- tabs
- Evidence Notes
- Run History

If an existing feature is not obvious in the reference image, keep it and place it appropriately in the redesigned layout.

**No feature loss is acceptable.**

---

# BACKEND RULE

Existing backend code and contracts must remain healthy.

Do not delete working backend code.

Do not replace real API/state behavior with mock data.

Do not hardcode fake results to match the screenshot.

Do not remove an API call because it is inconvenient for the new UI.

If the redesigned UI genuinely requires backend information that does not currently exist:

- inspect the existing backend first
- extend it minimally if necessary
- keep changes backward-compatible
- update frontend types/state accordingly
- preserve all existing backend capabilities

Backend work is allowed **only when required to make the redesigned UI genuinely functional**.

Preferred strategy:

**preserve existing backend → extend only if needed**

Never:

**delete backend logic → replace with frontend fake**

---

# IMPLEMENTATION STYLE

Make targeted changes.

Before editing:

1. Locate the existing Backtesting Lab page/component.
2. Identify its child components.
3. Identify page-specific styles.
4. Identify the existing handlers/hooks/API integrations.
5. Keep those functional connections intact.

Then refactor the layout and styling around them.

Prefer modifying existing files/components over creating a parallel replacement page.

Do not rewrite unrelated areas of APEX.

---

# 1368×753 LAYOUT TARGET

Use the existing global APEX sidebar/header.

Approximate layout inside the page:

```text
Viewport:             1368 × 753

Sidebar:              ~172px wide
Top header:           ~56px high

Main content after sidebar:
                      ~1196px wide

Page inner padding:   ~12px

Workspace:
Left panel:           ~390px
Gap:                  12px
Evidence panel:       remaining width (~770px)
```

Recommended workspace:

```css
display: grid;
grid-template-columns: 390px minmax(0, 1fr);
gap: 12px;
```

The **Evidence Area must be visually dominant**.

The left Configure Replay panel may scroll internally.

---

# CORE COLORS

First reuse existing APEX theme variables if equivalent values already exist.

Do not create duplicate global theme tokens.

Visual targets:

```text
Page background        #F7F9FC
Card                    #FFFFFF
Secondary surface       #F8FAFC

Border                  #DCE5ED
Stronger border         #CBD8E4

Primary text            #0F213A
Secondary text          #52657A
Muted text              #7C8DA0

Green                   #16A34A
Green hover             #138A3E
Green pressed           #107735
Soft green              #EFFAF2
Soft green border       #BFE5C9

Blue                    #2563EB
Soft blue               #EEF5FF

Amber                   #C27A0A
Soft amber              #FFF7E8

Danger                  #DC4854
Soft danger             #FFF1F2
```

Keep the existing APEX look.

No neon.
No excessive gradients.
No heavy glassmorphism.
No giant shadows.

---

# GEOMETRY / SPACING

Primary cards:

```css
border: 1px solid #DCE5ED;
border-radius: 12px;
background: #fff;
```

Internal card padding:

```text
12–16px
```

Main section gap:

```text
12px
```

Form/control gaps:

```text
8–10px
```

Controls:

```text
Input/select height      34–36px
Primary button           36–38px
Utility button           30–34px
Icon button              32–34px
Chip                      20–22px
```

Use compact professional density.

---

# TYPOGRAPHY

Use the existing APEX font stack.

Do not introduce a new font dependency.

Target:

```text
Page title               22px
Evidence hero title      17–18px
Panel title              13–14px
Control values           11–12px
Labels                   10–11px
Helper/meta               9–11px
```

Avoid overly bold numeric values.

---

# LEFT — CONFIGURE REPLAY

Do not redesign its functionality.

Improve only hierarchy, density, spacing and readability.

Target organization:

1. Configure Replay header + Ready state
2. Strategy selector
3. strategy tags
4. Market / Timeframe / Requested period
5. History bars / Maximum hold
6. Direction
7. Display capital
8. Risk profile
9. Strategy Parameters
10. Cost Assumptions
11. readiness/validation feedback
12. Save Preset / Reset / Run Backtest

Internal vertical scrolling is allowed and preferred over crushing controls.

---

# RIGHT — EVIDENCE AREA

This is the main UI improvement.

Match the attached reference closely.

## 1. Evidence Header

Contains:

- Evidence Area
- subtitle
- Export
- Full screen

Keep Export disabled when the real application says no exportable result exists.

---

## 2. Strategy / Status Row

Show real state:

- ready/no result/running/completed/error
- strategy name
- market
- timeframe
- direction
- fingerprint state

---

## 3. Metric Summary

Use compact cells/cards for the existing real values such as:

- Bars
- Max hold
- Run time
- Data source
- Warnings
- Confidence/readiness only if already supported

Never invent values.

---

## 4. Main Evidence Hero

Match the reference.

Approximate target:

```text
height: 170–190px
padding: 16px
border-radius: 12px
```

Use a very soft green background/tint.

Recommended layout:

```css
display: grid;
grid-template-columns: minmax(0, 42%) minmax(0, 58%);
gap: 16px;
```

The left side contains the attached matching evidence illustration.

The right side contains:

- current status headline
- short status explanation
- “What happens next?”
- meaningful step list
- Run Backtest CTA where appropriate

All status text must come from or correspond truthfully to actual application state.

---

# MATCHING HERO SVG

Use the attached:

`apex-backtesting-evidence-hero.svg`

This SVG is specifically prepared to match the hero illustration in the approved reference.

Recommended location:

`src/assets/backtesting/apex-backtesting-evidence-hero.svg`

Do not use the previously supplied unrelated SVG pack.

Use the existing APEX icon system for ordinary icons/statuses.

Do not add an SVG library dependency.

---

# 5. Workflow Feedback

Implement the visible:

```text
Configure → Run → Review
```

State must be real:

- completed = green
- active = emphasized
- pending = neutral

Do not mark a stage completed simply because it looks better.

---

# 6. Tabs

Keep the existing real functionality.

Visual target:

- Output Overview
- Evidence Notes
- Run History

Active tab:
green accent/underline.

Do not create decorative non-functional tabs.

---

# 7. Empty / Pre-run Content

Avoid a giant blank container.

Use the existing data to display meaningful pre-run information such as:

- Market / Direction
- Timeframe / Bars
- required data state
- cost assumptions
- prerequisites
- data availability
- fingerprint state
- result status

Do not invent fake metrics.

---

# BUTTONS & VISUAL FEEDBACK

Buttons must visibly support:

- default
- hover
- focus
- pressed
- disabled
- loading
- success/error where relevant

Run Backtest must remain connected to its EXISTING handler/backend workflow.

Example loading label:

`Running Backtest…`

Only show success after real success.

Selected controls such as LONG and Balanced must have clear active feedback.

---

# DO NOT TOUCH UNRELATED CODE

Unless technically necessary for this page, do not modify:

- Trading execution
- Orders
- Portfolio
- Authentication
- Market data architecture
- unrelated routes
- unrelated global layouts
- unrelated backend services
- unrelated CSS

Keep the change scoped to Backtesting Lab and any directly required shared component.

---

# VALIDATION

Do not spend time validating other screen sizes.

Validate ONLY:

# 1368 × 753

After implementation:

1. launch the real APEX application
2. open the Backtesting Lab
3. set viewport exactly to 1368×753
4. compare visually against the attached reference
5. test the actual interactions

Check:

- no clipping
- no horizontal overflow
- Configure Replay scroll works
- Evidence Area geometry matches reference
- Run Backtest is functional
- selectors/inputs still work
- tabs work
- Export state is real
- Full screen remains functional if currently implemented
- loading/error/result states remain real
- backend-connected behavior is intact

Run the project’s existing lint/type checks relevant to modified files.

If backend code was changed, run the relevant backend tests too.

---

# COMPLETION RULE

Do not report completion until:

- the visual refactor is implemented
- all existing Backtesting Lab features remain available
- frontend/backend integration is functional
- no fake result/state was introduced
- the real page was checked at exactly 1368×753
- no unrelated functionality was broken

---

# FINAL INSTRUCTION

Do not rewrite the Backtesting Lab from scratch.

**Refactor the existing implementation in place.**

Preserve all existing functionality and backend behavior.

Make the smallest clean set of code changes necessary to transform the current page into the attached reference design at exactly **1368×753**.
