# گزارش نهایی سخت‌سازی تم روشن APEX — نسخه 1.0.41

## مبنای کار

این نسخه از پروژه کامل `APEX-complete-ui-safe-merge-v1.0.40` ساخته شد. هدف، تثبیت تم روشن در کل رابط کاربری، جلوگیری از بازگشت باگ Design Token، حذف منابع متناقض و آماده‌کردن یک Release Gate قابل تکرار برای ابعاد پایه `1368×753` بود.

هیچ Route، قرارداد API، کلید localStorage، محاسبه مالی، Strategy Engine، Scanner Gate یا مسیر ثبت سفارش تغییر نکرده است.

## اصلاحات اصلی تم روشن

### 1. ترتیب قطعی Styleها

ورود Styleهای اصلی در `src/main.tsx` متمرکز شد:

```text
index.css (Tailwind + tokens)
workspace-shell.css
reference-ui.css
interaction-polish.css
light-theme-hardening.css
```

Importهای تکراری از `WorkspaceShell.tsx` و `referenceUi.tsx` حذف شدند. در نتیجه ترتیب Cascade دیگر به زمان بارگذاری Component Chunk وابسته نیست.

### 2. قرارداد صریح Light Mode

فایل جدید زیر اضافه شد:

```text
src/styles/light-theme-hardening.css
```

این فایل فقط در حالت زیر فعال است:

```css
:root[data-apex-theme-resolved="light"]
```

و موارد زیر را به‌صورت صریح تثبیت می‌کند:

- Canvas، Card Surface، Soft Surface و Border؛
- رنگ اصلی و ثانویه متن؛
- رنگ‌های معنایی خوانا برای Success، Error، Warning و Info؛
- توکن‌های صفحات V20؛
- Surfaceهای Header، Sidebar، Search، Table، Settings، Help و Context Rail؛
- Selected Row، Hover، Disabled و Focus؛
- High Contrast و Forced Colors؛
- حذف Ambient Blobهای متعلق به پوسته قدیمی تیره در Light Mode؛
- تبدیل Avatar مشکی قدیمی به Avatar سبز تینت‌دار APEX؛
- تقویت متن‌های کم‌رنگ قدیمی در Overview، Markets، Trading و Strategy Studio.

### 3. بهبود کنتراست

نسبت‌های محاسبه‌شده در QA:

```text
Muted text / canvas:      4.77:1
V20 muted / soft surface: 4.64:1
Green status / white:     5.81:1
Red status / white:       5.78:1
Amber status / white:     6.53:1
Primary ink / canvas:    15.01:1
```

### 4. فونت‌های محلی

لینک‌های Google Fonts از `index.html` حذف شدند. فونت‌های Inter و JetBrains Mono اکنون از Dependencyهای محلی پروژه وارد می‌شوند. بنابراین ظاهر Light Mode به دسترسی شبکه، CORS یا مسدودشدن سرویس فونت خارجی وابسته نیست.

### 5. رفع متغیر تعریف‌نشده Backtesting

در فایل زیر:

```text
src/pages/backtesting/BacktestingPage.css
```

متغیر تعریف‌نشده `--bt-surface-soft` با توکن معتبر `--bt-soft` جایگزین شد.

### 6. جلوگیری از Cache قدیمی Service Worker

نام Cache از نسخه قدیمی `v1.0.34` به `v1.0.41` ارتقا یافت تا CSS قبلی پس از نصب نسخه جدید باقی نماند.

### 7. پاک‌سازی کدهای مرده

پس از تأیید نبود Import فعال، این فایل‌ها حذف شدند:

```text
src/components/workspace/ReferenceViews.tsx
src/services/workspaceClient.ts
src/pages/pages/strategies/StrategyPage.css
```

صفحات فعال Split شده، `workspaceInsights` و CSS واقعی Strategy دست‌نخورده باقی مانده‌اند. Function Index نیز با وضعیت جدید هماهنگ شد.

## QA اضافه‌شده

### Static Light Theme Contract

```bash
npm run qa:light-theme
```

این تست 32 بررسی انجام می‌دهد؛ از جمله:

- ترتیب Styleها؛
- حضور `tokens.css`؛
- نبود Google Fonts؛
- Pre-paint Theme Bootstrap؛
- توکن‌های Light و V20؛
- کنتراست رنگ‌ها؛
- Focus و High Contrast؛
- Cache Version؛
- پوشش تمام Routeها در Runtime QA.

### Runtime Light Theme Contract

`scripts/qa/verifyWorkspaceRuntime.mts` توسعه داده شد تا تمام 14 Route را در Light Mode و ابعاد `1368×753` بررسی و Screenshot کند:

```text
overview, markets, watchlist, portfolio, trading, orders, positions,
alerts, history, analytics, backtesting, strategies, settings, help
```

بررسی‌ها شامل موارد زیر است:

- Theme Resolution؛
- Surface شفاف یا تیره؛
- کنتراست متن Container؛
- Collapse شدن Panel؛
- Horizontal Overflow؛
- Avatar مشکی قدیمی؛
- خالی‌بودن Computed Tokenها؛
- Console و Page Error.

یک خطای Syntax قدیمی ناشی از Loop تکراری در همین Runtime QA نیز اصلاح شد.

## نتایج اعتبارسنجی اجراشده

```text
Design Token Contract:           PASS — 5/5
Light Theme Contract:            PASS — 32/32
UI Theme Merge Contract:         PASS — 11/11
Reference UI Redesign:           PASS — 24/24
UI Interaction Polish:           PASS — 28/28
System Integration:              PASS — 12/12
Backtesting Workspace:           PASS — 25/25
Consolidation Integration:       PASS — 15/15
V20 Reference Contract:          PASS — 33/33
V19 Contract:                    PASS — 10/10
Strategy Library:                PASS
Strategy Integration:            PASS
Strategy Engines:                PASS
Adaptive Governor:               PASS
TypeScript isolated transpile:   PASS — 272 files / 0 syntax errors
CSS parse:                       PASS — 26 files / 0 errors
Source-only secret gate:         PASS
```

## محدودیت محیط فعلی

اجرای زیر انجام شد:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

اما Registry داخلی این محیط برای بسته زیر خطای 404 برگرداند:

```text
why-is-node-running@2.3.0
```

بنابراین در این Container امکان اجرای Dependency-backed TypeScript، Vitest، Production Build و Playwright Browser Runtime وجود نداشت. به همین دلیل، نتیجه Build یا Screenshot واقعی برای این نسخه ادعا نشده است.

Release Gate نهایی روی سیستمی با دسترسی صحیح به Registry:

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

## نسخه

```text
APEX 1.0.41
Baseline viewport: 1368×753
Primary focus: deterministic, readable and regression-protected Light Mode
```
