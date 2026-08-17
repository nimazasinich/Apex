# APEX Strategy Studio — Pixel-Referenced Production Implementation Specification

## 0. Purpose

Replace the **existing APEX Strategies / Strategy Studio UI** with the interface shown in the attached reference image.

This is a **real production refactor**, not a static mockup.

The implementation agent must:

- preserve the existing APEX global sidebar and top header unless a tiny alignment adjustment is required;
- replace/refactor only the Strategies workspace;
- preserve all working strategy/business logic, handlers, API calls, validation, state, backend contracts, routing, and data models;
- use the reference image as the visual source of truth;
- use real state for all status labels and metrics;
- never fabricate `Evidence Ready`, confidence values, warnings, model scores, optimization results, or validation success;
- keep every current strategy feature available, even if it must be moved into the new layout;
- use local SVG assets or the existing APEX icon system — never external image URLs.

---

# 1. Reference Geometry

## 1.1 Native reference raster

The supplied reference image measures:

```text
1448 × 1086 px
Aspect ratio: 4:3
```

All measurements below are derived from this raster and should be treated as **pixel-reference targets**, with ±2–4 px tolerance for anti-aliasing, font metrics, and browser rendering.

Do **not** use a CSS `transform: scale(...)` to imitate the reference.

Use CSS Grid/Flexbox and controlled internal scrolling.

If the product is QA-tested at another viewport (for example 1368×753), preserve the same hierarchy and proportions, reduce side-column widths proportionally, and use internal scrolling rather than shrinking typography or globally scaling the UI.

---

# 2. Global Shell — Do Not Rebuild Unless Required

The screenshot includes the existing APEX chrome only for context.

Approximate reference geometry:

| Region | X | Y | W | H |
|---|---:|---:|---:|---:|
| Global sidebar | 0 | 0 | 130 | 1086 |
| Global top bar | 130 | 0 | 1318 | 56 |
| Strategy page working area | 130 | 56 | 1318 | 1030 |

Rules:

- Keep the existing APEX logo, navigation, search, Demo Trading indicator, market-data status, global icons, and user avatar.
- Do not duplicate the global header inside Strategy Studio.
- Do not modify unrelated routes.
- Active sidebar item must be `Strategies`.
- Active Strategy nav treatment: pale mint background, green icon/text, subtle green left/outline accent.

---

# 3. Page-Level Three-Column Layout

The Strategies content begins below the top header.

Reference geometry:

```text
left Strategy Library:  ~266 px
center Strategy Studio:  ~700 px
right Evidence rail:     ~270 px
horizontal gaps:         ~12–16 px
outer content padding:   ~14 px
```

Recommended CSS:

```css
.strategy-studio-page {
  --ss-gap: 14px;
  --ss-radius-lg: 12px;
  --ss-radius-md: 10px;
  --ss-border: #E1E7ED;
  --ss-border-strong: #D4DDE6;
  --ss-surface: #FFFFFF;
  --ss-surface-soft: #F8FAFC;
  --ss-canvas: #FBFCFD;

  min-width: 0;
  height: calc(100vh - var(--apex-header-height, 56px));
  padding: 8px 14px 14px;
  overflow: hidden;
  background: var(--ss-canvas);
}

.strategy-studio-grid {
  display: grid;
  grid-template-columns: 266px minmax(0, 1fr) 270px;
  gap: var(--ss-gap);
  height: 100%;
  min-width: 0;
}
```

At widths where the current global APEX chrome leaves less room, use:

```css
grid-template-columns:
  clamp(220px, 19vw, 266px)
  minmax(560px, 1fr)
  clamp(220px, 19vw, 270px);
```

Never let the center workspace collapse below usability.

If necessary, the **left library** and **right evidence rail** may scroll internally.

---

# 4. Workflow Stepper

Position it above the center workspace, aligned with the center column.

Reference sequence:

```text
✓ Discover  ───  2 Configure  ───  3 Validate  ───  4 Send to Backtesting
```

Approximate source geometry:

```text
top: 63 px from image top
height: 34–38 px
centered above main center card
```

### Visual states

**Completed**
- circle: green outline/fill;
- check icon;
- label muted-dark;
- connector green or neutral-green.

**Current**
- 28 px circle;
- teal/cyan fill;
- white number;
- label bold;
- 2 px teal underline below the stage.

**Pending**
- white / very light surface;
- #DCE4EC border;
- #718198 text.

Recommended tokens:

```css
--step-complete: #11995D;
--step-current: #159AA5;
--step-pending-border: #DCE4EC;
--step-pending-text: #718198;
```

Do not mark steps complete from appearance alone. Bind them to actual state.

Suggested state mapping:

```ts
type StrategyWorkflowStage =
  | "discover"
  | "configure"
  | "validate"
  | "send-to-backtesting";
```

---

# 5. Color System

The screenshot contains anti-aliased raster colors. Use the canonicalized values below rather than sampling individual pixels.

## 5.1 Core neutral palette

```css
:root {
  --apex-ink-950: #0B1830;
  --apex-ink-900: #10203A;
  --apex-ink-700: #42536A;
  --apex-ink-600: #5B6D84;
  --apex-ink-500: #718198;

  --apex-page: #FBFCFD;
  --apex-surface: #FFFFFF;
  --apex-surface-soft: #F8FAFC;

  --apex-border: #E2E8EE;
  --apex-border-strong: #D4DEE7;
  --apex-divider: #EDF1F4;
}
```

## 5.2 Primary green / teal system

Reference-derived button colors are centered around approximately RGB `(4,159,139)`.

Use:

```css
--apex-green: #12985C;
--apex-green-strong: #0D8B50;
--apex-green-soft: #EFF9F3;

--apex-teal: #079D8C;
--apex-cyan-teal: #0A9EAA;
--apex-cyan: #159FB5;
--apex-teal-soft: #ECF8F7;
```

### Primary green–teal gradient

Use for:
- `Run Validation`
- `Send to Backtesting`

```css
background:
  linear-gradient(
    105deg,
    #0A95A8 0%,
    #079D8C 48%,
    #0B985F 100%
  );
```

Hover:

```css
background:
  linear-gradient(
    105deg,
    #07899C 0%,
    #078F80 48%,
    #087F50 100%
  );
box-shadow: 0 5px 14px rgba(7, 151, 133, 0.18);
```

Pressed:

```css
transform: translateY(1px);
box-shadow: inset 0 1px 2px rgba(5, 60, 55, 0.12);
```

Do not use neon greens.

## 5.3 Semantic accents

```css
--apex-blue: #367CF3;
--apex-blue-soft: #EEF5FF;

--apex-purple: #8B5CF6;
--apex-purple-soft: #F4F0FF;

--apex-orange: #F59E0B;
--apex-orange-soft: #FFF7E8;

--apex-red: #F0445E;
--apex-red-soft: #FFF0F3;
```

---

# 6. Typography

Use the **existing APEX font stack**. Do not introduce a new web font if the project already has one.

Recommended sizes:

```text
Main strategy title:          22–24 px / 1.2 / 650–700
Panel headings:               12–13 px / 650–700
Section headings:             11–12 px / 650
Card titles:                  11–13 px / 600–650
Body copy:                    10–11 px / 1.45
Metadata label:                8–9 px / 600 / uppercase
Metadata value:               10–11 px / 600
Input/select value:           10–11 px
Slider number:                16–17 px / 650
Micro labels:                  8–9 px
```

Avoid making numeric values excessively bold.

---

# 7. Surface, Border, Radius, Shadow Rules

Primary panels:

```css
background: #FFFFFF;
border: 1px solid #E2E8EE;
border-radius: 12px;
box-shadow: 0 1px 2px rgba(15, 33, 58, 0.025);
```

Interactive card hover:

```css
border-color: #C9D7E1;
box-shadow: 0 4px 12px rgba(15, 33, 58, 0.045);
```

Selected strategy:

```css
border: 2px solid #159A60;
background:
  linear-gradient(180deg, #FFFFFF 0%, #F7FCF9 100%);
box-shadow: 0 4px 14px rgba(19, 153, 96, 0.08);
```

Do not use heavy glassmorphism or large floating shadows.

---

# 8. Left Column — Strategy Library

## 8.1 Reference geometry

Approximate source bounds:

```text
x: 144
y: 95
w: 266
h: 884
```

Use a single card/panel with internal scroll.

Recommended:

```css
.strategy-library {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
}
```

### Panel header

Row:

```text
STRATEGY LIBRARY                           14 / 14
```

- uppercase section label;
- count aligned right;
- 10–12 px horizontal padding.

### Search

Height:

```text
34–36 px
```

Search icon on left, filter icon square on right.

### Filter matrix

Two columns × two rows:

```text
All Assets       All Categories
All Tags         Long & Short
```

Control height:

```text
30–32 px
```

Below:

```text
[bookmark icon] Bookmarked         Clear filters
```

## 8.2 Strategy cards

Cards should be **minimal but visually identifiable**.

Reference selected card:

```text
height: approximately 145 px
radius: 10 px
border: 2 px green
```

Normal cards:

```text
height: approximately 100–110 px
border: 1 px #E5EAF0
```

### Card hierarchy

1. `CANDIDATE` status chip — top left
2. `CORE ★` chip — top right
3. local strategy SVG thumbnail
4. strategy name
5. compact metadata row:
   - direction
   - timeframe
   - evidence/input count
6. registry/model id
7. overflow menu
8. selected card also shows bookmark button

Do **not** fill cards with decorative prose.

### Strategy card SVG thumbnails

Use local SVGs under:

```text
src/assets/strategies/
```

Recommended assets:

```text
strategy-card-fusion.svg
strategy-card-trend.svg
strategy-card-funding.svg
strategy-card-breakout.svg
strategy-card-volatility.svg
strategy-hero-isometric.svg
```

Do not use remote URLs.

---

# 9. SVG Geometry and Angles

The main strategy illustration is an **orthographic/isometric cube-grid graphic**.

## 9.1 Isometric geometry

Use these directions:

```text
right-up axis:   -30° from horizontal
right-down axis: +30° from horizontal
vertical axis:    90°
```

Equivalent basis:

```ts
const ISO_X = { x: 0.8660254, y: 0.5 };   // +30°
const ISO_Y = { x: -0.8660254, y: 0.5 };  // 150°
const ISO_Z = { x: 0, y: -1 };
```

Do not use perspective convergence. Parallel edges remain parallel.

### Stroke

```text
0.8–1.1 px
```

Suggested stroke colors:

```css
#77C8C2
#83D2C4
#A5DFD0
```

### Cube fills

Use layered translucent greens/teals:

```text
#DDF6EC at 28–45%
#9BE2C5 at 34–55%
#44C58E at 35–68%
#0EA674 at 48–78%
#07A69D at 30–55%
```

No harsh black strokes.

### Hero asset size

Reference visible illustration:

```text
approximately 155 × 125 px
```

Place it in the upper-right of the strategy identity card.

Example:

```css
.strategy-hero-art {
  width: clamp(140px, 16vw, 168px);
  height: 128px;
  object-fit: contain;
  align-self: start;
}
```

---

# 10. Center Column — Strategy Identity Card

Approximate source geometry:

```text
x: 421
y: 104
w: 700
h: 210
```

The top card contains:

- Candidate chip
- strategy title
- short one-to-two-line description
- bookmark icon
- overflow icon
- local isometric SVG
- metadata strip

### Title block

Keep copy concise.

Reference title:

```text
APEX Multi-Alpha Fusion Long/Short
```

Description should not exceed two lines in the normal state.

### Metadata strip

Seven compact cells:

```text
STRATEGY ID
VERSION
DIRECTION
INTERVALS
DATA TIER
SIGNAL
CONFIDENCE (AVG)
```

Recommended layout:

```css
.strategy-metadata {
  display: grid;
  grid-template-columns:
    1.35fr .55fr .85fr .9fr .8fr 1.05fr .75fr;
}
```

Each cell:

```css
padding: 9px 11px;
border-right: 1px solid #EDF1F4;
```

Last cell has no right border.

Do not invent confidence. If real confidence is unavailable use:

```text
—
Pending
Unavailable
```

---

# 11. Configuration Section

Approximate source bounds:

```text
x: 431
y: 323
w: 679
h: 337
```

Section heading:

```text
gear SVG  CONFIGURATION
```

## 11.1 Top controls

Three columns:

```text
Market        Timeframe        Direction
BTC-USDT      1h               Long | Short
```

Recommended:

```css
.configuration-top-row {
  display: grid;
  grid-template-columns: 1fr .78fr 1.15fr;
  gap: 18px;
}
```

Input height:

```text
34 px
```

Direction uses a segmented control.

Active Long:

```css
background: #F4FBF7;
border: 1px solid #65C894;
color: #168D55;
```

Inactive Short:

```css
background: #F6F8FA;
color: #52657A;
```

---

# 12. Parameter Sliders — Critical

Six parameter cards in a 3 × 2 grid:

```text
Evidence Agreement
Minimum Confidence
SMC Scanner Weight

Order Flow Weight
Live Sentiment Weight
Whale Flow Weight
```

Recommended grid:

```css
.strategy-parameter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
```

Card height:

```text
82–92 px
```

## 12.1 Slider visual

The reference uses a **green → teal → cyan-teal active track**.

Use:

```css
.param-slider {
  --pct: 68%;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background:
    linear-gradient(
      to right,
      #16A05C 0%,
      #0BA786 calc(var(--pct) * .55),
      #0B9FAD var(--pct),
      #E4E9EE var(--pct),
      #E4E9EE 100%
    );
}
```

Thumb:

```css
.param-slider::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid #CAD8D6;
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(15, 33, 58, 0.12);
  cursor: pointer;
}
```

Inner dot can be implemented with a wrapper/custom slider or pseudo-element:

```text
5–6 px teal/green center dot
```

## 12.2 Editable value

Users must be able to adjust the value by slider **and** by direct numeric entry if the current implementation already supports typing.

Do not remove keyboard control.

State pattern:

```ts
const pct = ((value - min) / (max - min)) * 100;
```

```tsx
<input
  type="range"
  min={min}
  max={max}
  step={step}
  value={value}
  style={{ "--pct": `${pct}%` } as React.CSSProperties}
  onChange={handleSliderChange}
/>
```

Keep `aria-label`, min/max, step and keyboard semantics.

---

# 13. Dynamic Fusion Section

Approximate source bounds:

```text
y: 668–798
```

Header:

```text
Dynamic Fusion      LIVE CONTEXT          Auto-refresh [toggle] Last updated ...
```

Under the header use five metric cards:

```text
Composite Score
Market Regime
Liquidity State
Volatility Regime
Confidence
```

Recommended grid:

```css
.dynamic-fusion-grid {
  display: grid;
  grid-template-columns: 1.05fr 1.25fr 1fr 1fr 1.05fr;
  gap: 8px;
}
```

### Metric examples shown in the reference

These values are only examples from the image and MUST NOT be hardcoded:

```text
72 / 100
Accumulation
Deep
Normal
0.79
```

Use actual application state.

### Icons

Use crisp SVG/icon components:

- score: sparkline;
- regime: four-node cluster;
- liquidity: dual droplets;
- volatility: pulse/wave;
- confidence: semicircular gauge.

SVG icon box:

```text
28–34 px
stroke width: 1.8–2
```

Do not render tiny blurry bitmap icons.

---

# 14. Confidence Gauge

Reference appearance:

- semicircle;
- green/teal arc;
- neutral remainder;
- small needle/dot;
- high-resolution SVG.

Suggested SVG:

```svg
<svg viewBox="0 0 64 38" aria-hidden="true">
  <path d="M8 32 A24 24 0 0 1 56 32"
        fill="none"
        stroke="#E5EAEE"
        stroke-width="7"
        stroke-linecap="round"/>
  <path d="M8 32 A24 24 0 0 1 49 16"
        fill="none"
        stroke="url(#g)"
        stroke-width="7"
        stroke-linecap="round"/>
  <circle cx="49" cy="16" r="3.2" fill="#0A9B86"/>
  <defs>
    <linearGradient id="g" x1="8" y1="32" x2="56" y2="10">
      <stop stop-color="#15A05E"/>
      <stop offset=".55" stop-color="#0AA88D"/>
      <stop offset="1" stop-color="#0A9DAE"/>
    </linearGradient>
  </defs>
</svg>
```

Bind arc length to real confidence.

---

# 15. Model Explanation Section

Reference section:

```text
MODEL EXPLANATION
```

Six cards:

```text
Inputs
Regime & Setup
Trigger
Risk & Sizing
Exit
Limits
```

Use distinct semantic SVG accents:

```text
Inputs             blue
Regime & Setup     green
Trigger            purple
Risk & Sizing      orange
Exit               cyan/blue
Limits             red
```

Card height:

```text
58–68 px
```

Each card contains:

- SVG icon;
- short title;
- one short real-state sublabel.

Do not add paragraphs.

Examples of concise sublabels:

```text
12 signals
Accumulation
Confluence met
1.2% per trade
Targets & stops
Guardrails
```

Only show these if real state supports them.

---

# 16. Center Action Footer

Bottom action row:

```text
Open Details | Compare | Bookmark Model | Send to Backtesting ▼
```

Approximate height:

```text
48–56 px
```

Buttons:
- secondary buttons: white, 1 px border;
- primary: green–teal gradient;
- split dropdown at the far right of `Send to Backtesting`.

Primary button:

```css
height: 42px;
min-width: 205px;
border-radius: 8px;
```

Use a clearly visible paper-plane/send SVG.

Do not send anything automatically. Respect the app's current manual confirmation behavior.

---

# 17. Right Rail — Evidence & Validation

Approximate source column:

```text
x: 1138
y: 104
w: 270
```

Stack the following cards with ~12–14 px gaps.

## 17.1 Evidence & Validation

Header:

```text
EVIDENCE & VALIDATION                  CANDIDATE
```

Primary button:

```text
[flask SVG]  Run Validation
```

Approximate button:

```text
height: 44–48 px
radius: 8 px
```

Make the flask icon clear:

```text
20–22 px
stroke: 1.8–2 px
white
```

Button gradient:

```css
linear-gradient(105deg, #0A95A8 0%, #079D8C 50%, #0B985F 100%)
```

Supporting copy under button: max 2–3 short lines.

## 17.2 Secondary Research

Two buttons:

```text
Run Smart Optimization
Liquidity Hunter Shadow
```

Use:
- blue outlined treatment for optimization;
- green outlined treatment for liquidity hunter.

Icons should be 22–24 px SVGs.

## 17.3 Evidence Status

State card:

```text
✓ Evidence Ready
```

Only show `Ready` if the real validation/evidence state confirms it.

Otherwise render truthful states:

```text
Evidence Pending
Validation Required
Evidence Unavailable
Validation Failed
```

Reference card metrics:

```text
Snapshot age
Layers loaded
Confidence
```

Confidence visualization uses a row of small dots plus the numeric value.

## 17.4 Warnings & Limitations

Render warning rows, not one giant block.

Each warning:

- orange warning triangle SVG;
- 1-line title;
- 1–2 line explanation.

Example labels in the screenshot:

```text
No server packet
Regime sensitivity
```

Do not hardcode them unless the system actually emits them.

## 17.5 Data & Ecosystem / Registry

Bottom card contains real registry data.

Rows:

```text
Registry
Model Data Tier
```

Registry id can be a blue link/action.

Include external/open icon only if the action exists.

---

# 18. Scroll Behavior

At the native reference height, the layout is mostly visible.

At shorter heights:

- global page must **not** acquire a horizontal scrollbar;
- left library may scroll internally;
- center workspace may scroll vertically;
- right evidence rail may scroll internally;
- keep action buttons reachable;
- do not shrink controls below readable size.

Suggested:

```css
.strategy-library,
.strategy-center-scroll,
.strategy-evidence-rail {
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}
```

Scrollbar styling should be subtle:

```text
track: transparent
thumb: #CBD5DF
width: 6 px
radius: 999 px
```

---

# 19. Interaction Feedback

Every interactive element must support:

```text
default
hover
focus-visible
pressed
disabled
loading
success
error
selected
```

Focus ring:

```css
outline: 2px solid rgba(21, 159, 181, 0.32);
outline-offset: 2px;
```

Do not remove keyboard focus.

---

# 20. State Integrity — No Fake UI

Never hardcode screenshot values merely to match the image.

The following must come from real application state or a real calculation:

- selected strategy;
- strategy version;
- direction;
- interval;
- data tier;
- signal source;
- confidence;
- evidence agreement;
- all slider values;
- composite score;
- market regime;
- liquidity state;
- volatility regime;
- evidence state;
- warning list;
- layer count;
- snapshot age;
- validation result;
- optimization state;
- registry id.

If absent:

```text
—
Pending
Unavailable
Not validated
No evidence yet
```

is preferred over fabrication.

---

# 21. Functional Mapping Before Editing

Before changing JSX, create an internal map:

```text
Existing UI feature
→ current component
→ current handler
→ current state/store
→ service/API
→ backend contract
→ new visual location
```

The new design must be a **skin/layout upgrade around the real logic**.

Do not create a disconnected visual duplicate.

---

# 22. Recommended Component Structure

Use existing components where possible. If the current page is monolithic, extract only page-local components.

Recommended target structure:

```text
src/pages/strategies/
  StrategyStudioPage.tsx
  StrategyStudioPage.css

src/components/strategies/
  StrategyWorkflowStepper.tsx
  StrategyLibraryPanel.tsx
  StrategyLibraryCard.tsx
  StrategyIdentityHeader.tsx
  StrategyMetadataStrip.tsx
  StrategyConfigurationPanel.tsx
  StrategyParameterSlider.tsx
  StrategyDynamicFusion.tsx
  StrategyModelExplanation.tsx
  StrategyActionFooter.tsx
  StrategyEvidenceRail.tsx
  StrategyValidationCard.tsx
  StrategyEvidenceStatusCard.tsx
  StrategyWarningsCard.tsx
  StrategyRegistryCard.tsx

src/assets/strategies/
  strategy-hero-isometric.svg
  strategy-card-fusion.svg
  strategy-card-trend.svg
  strategy-card-funding.svg
  strategy-card-breakout.svg
  strategy-card-volatility.svg
```

Do not create components just to reach a specific file count.

---

# 23. Example Center Layout JSX

```tsx
<section className="strategy-center">
  <StrategyWorkflowStepper stage={workflowStage} />

  <div className="strategy-center-scroll">
    <StrategyIdentityHeader
      strategy={selectedStrategy}
      metadata={strategyMetadata}
    />

    <StrategyConfigurationPanel
      market={market}
      timeframe={timeframe}
      direction={direction}
      parameters={parameters}
      onMarketChange={onMarketChange}
      onTimeframeChange={onTimeframeChange}
      onDirectionChange={onDirectionChange}
      onParameterChange={onParameterChange}
    />

    <StrategyDynamicFusion
      state={fusionState}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={setAutoRefresh}
      onRefresh={refreshFusion}
    />

    <StrategyModelExplanation model={modelExplanation} />

    <StrategyActionFooter
      onOpenDetails={openDetails}
      onCompare={compare}
      onBookmark={bookmark}
      onSendToBacktesting={sendToBacktesting}
    />
  </div>
</section>
```

---

# 24. Example Root Grid JSX

```tsx
<div className="strategy-studio-page">
  <div className="strategy-studio-grid">
    <StrategyLibraryPanel
      strategies={strategies}
      selectedId={selectedStrategyId}
      filters={filters}
      onSelect={selectStrategy}
      onFiltersChange={setFilters}
    />

    <StrategyCenterWorkspace />

    <StrategyEvidenceRail
      validation={validationState}
      evidence={evidenceState}
      warnings={warnings}
      registry={registry}
    />
  </div>
</div>
```

---

# 25. Accessibility

Required:

- semantic buttons;
- visible focus states;
- SVG icons with `aria-hidden="true"` when decorative;
- meaningful labels for icon-only buttons;
- slider labels connected by `aria-labelledby`;
- real disabled state;
- no status conveyed by color alone;
- keyboard-operable segmented direction control;
- readable contrast.

---

# 26. Visual Fidelity Priorities

When trade-offs are required, prioritize in this order:

1. three-column information architecture;
2. center Strategy workspace dominance;
3. compact Strategy Library;
4. stepper clarity;
5. configuration slider layout;
6. green–teal visual language;
7. Evidence rail hierarchy;
8. crisp SVG icons;
9. exact spacing/radii;
10. decorative isometric illustration.

Do not sacrifice function for decorative fidelity.

---

# 27. Things the Agent Must NOT Do

Do not:

- replace the Strategy backend with mocks;
- hardcode screenshot metrics;
- add fake validation success;
- delete currently working strategy types;
- remove filters because the reference looks simpler;
- remove compare/bookmark/details actions;
- remove a parameter because it is not visible in the screenshot;
- turn a working input into a decorative slider with no real state binding;
- use raster images for ordinary UI icons;
- use remote SVG/image URLs;
- use a giant CSS `transform: scale()`;
- rewrite global APEX layout unnecessarily;
- introduce a new UI framework just for this page;
- introduce a new icon library unless absolutely necessary;
- use excessive `!important`;
- modify Trading, Orders, Portfolio or Backtesting business logic for visual convenience.

---

# 28. Reference Coordinate Map

These are approximate measured bounds on the 1448×1086 source raster.

| Element | Approx bounds |
|---|---|
| Global sidebar | x 0–130, y 0–1086 |
| Global header | x 130–1448, y 0–56 |
| Strategy Library | x 144–410, y 95–980 |
| Workflow stepper | x ~458–1000, y 63–97 |
| Center strategy workspace | x 421–1120, y 104–980 |
| Strategy identity/header | x 431–1110, y 104–313 |
| Configuration | x 431–1110, y 323–660 |
| Dynamic Fusion | x 431–1110, y 668–798 |
| Model Explanation | x 431–1110, y 806–907 |
| Center action footer | x 431–1110, y 916–980 |
| Right Evidence rail | x 1138–1408, y 104–991 |
| Validation card | y ~104–276 |
| Secondary Research | y ~287–395 |
| Evidence Status | y ~408–627 |
| Warnings | y ~640–836 |
| Data & Ecosystem | y ~849–991 |

Use these as a **geometry guide**, not absolute-position CSS.

---

# 29. Implementation Order

Execute in this exact order:

1. Audit the existing Strategies route and component tree.
2. Inventory every current feature and handler.
3. Identify current APIs, stores, hooks, validation logic and registry data.
4. Record current strategy card data model.
5. Place the supplied reference image in project documentation for comparison.
6. Add local strategy SVG assets.
7. Build the three-column grid without changing logic.
8. Refactor Strategy Library.
9. Refactor selected strategy identity block.
10. Implement Configuration grid.
11. Replace numeric-only parameter presentation with synchronized high-quality sliders where appropriate.
12. Implement Dynamic Fusion metric cards.
13. Implement Model Explanation cards.
14. Implement the right Evidence & Validation rail.
15. Wire workflow stepper to real state.
16. Verify actions: Details, Compare, Bookmark, Validation, Optimization, Liquidity Hunter, Send to Backtesting.
17. Verify every old feature is still reachable.
18. Run lint/typecheck.
19. Launch the real app.
20. Run visual QA against the reference.
21. Run functional QA.
22. Report any mismatch honestly.

---

# 30. Acceptance Checklist

## Layout

- [ ] Strategy page uses the three-column layout.
- [ ] Left library is compact and independently scrollable.
- [ ] Center workspace is dominant.
- [ ] Right evidence rail is clearly separated.
- [ ] No horizontal page overflow.
- [ ] No clipped primary action.
- [ ] No overlapping controls.

## Strategy Library

- [ ] Search works.
- [ ] filters work.
- [ ] bookmark filter works.
- [ ] selected strategy treatment matches reference.
- [ ] SVG thumbnails are local and crisp.
- [ ] strategy selection still drives center content.

## Configuration

- [ ] Market selector works.
- [ ] timeframe selector works.
- [ ] Long/Short works.
- [ ] all six visible parameter sliders are synchronized with real values.
- [ ] keyboard adjustment works.
- [ ] min/max/step are correct.
- [ ] no values are hardcoded.

## Dynamic Fusion

- [ ] all metrics come from real state.
- [ ] auto-refresh control works.
- [ ] manual refresh works if currently supported.
- [ ] icons are SVG-quality.
- [ ] confidence gauge is state-driven.

## Evidence & Validation

- [ ] Run Validation calls the real validation workflow.
- [ ] loading state is visible.
- [ ] failure is visible.
- [ ] success appears only after real success.
- [ ] warnings come from real data.
- [ ] evidence state is truthful.
- [ ] registry values are real.
- [ ] secondary research actions remain functional.

## Workflow

- [ ] Discover stage state is real.
- [ ] Configure stage state is real.
- [ ] Validate stage state is real.
- [ ] Send to Backtesting stage state is real.
- [ ] no decorative fake completion.

## Actions

- [ ] Open Details works.
- [ ] Compare works.
- [ ] Bookmark Model works.
- [ ] Send to Backtesting works.
- [ ] split/dropdown action works if present.
- [ ] no automatic live trade/order action is introduced.

## Regression

- [ ] existing strategy types remain available.
- [ ] existing backend contracts remain compatible.
- [ ] no unrelated APEX page was redesigned.
- [ ] no working feature was deleted.
- [ ] no mock metric/result was introduced.

---

# 31. Final Agent Instruction

Implement this UI **inside the existing APEX Strategy Studio**, not as a second demo page.

The existing codebase is the **functional source of truth**.

The attached screenshot is the **visual source of truth**.

The finished result must combine both:

> **real existing APEX strategy logic + the exact information hierarchy, geometry, SVG quality, green/teal visual language, slider treatment, workflow clarity, and Evidence rail composition of the reference image.**

Do not remove functionality to simplify the implementation.

If a feature is difficult to fit into the new layout, integrate it properly or place it behind a real expandable/detail surface — never delete it.

Do not report completion until the real Strategy page has been launched, visually compared against the reference, and its actual interactions have been tested.
