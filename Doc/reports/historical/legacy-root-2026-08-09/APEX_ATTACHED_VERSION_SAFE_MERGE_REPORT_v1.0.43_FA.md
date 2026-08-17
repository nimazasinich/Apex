# گزارش مقایسه و ادغام امن نسخه پیوست — APEX v1.0.43

## مبنای بررسی

نسخه پیوست‌شده:

```text
APEX-complete-ui-safe-merge-v1.0.40
```

نسخه‌ای که قبلاً تحویل شده بود:

```text
APEX-complete-light-theme-hardened-v1.0.42
```

نسخه نهایی این بررسی:

```text
APEX-complete-integrated-v1.0.43
```

---

## نتیجه مقایسه کامل Source

هر دو پروژه به‌صورت فایل‌به‌فایل و با SHA-256 مقایسه شدند.

```text
Source files in attached version: 236
Source files in merged version:   236
Common source paths:              233
Byte-identical common files:      228
Intentional differing files:      5
Attached-only source files:       3
Merged-only source files:         3
```

تفاوت‌های باقی‌مانده تصادفی نیستند و در ادامه توضیح داده شده‌اند.

---

## قابلیت‌های مفید نسخه پیوست که ادغام شدند

### 1. TradingToolbox کامل

فایل زیر از نسخه پیوست بازیابی و در مسیر فعال Trading ادغام شد:

```text
src/components/workspace/TradingToolbox.tsx
```

این قابلیت چهار Drawer عملیاتی را حفظ می‌کند:

```text
Order Book / Depth
Recent Trades
System Link
Setup Intelligence / Signals
```

Toolbox فقط اضافه نشده، بلکه در `AccountViews.tsx` واقعاً import و render می‌شود.

### 2. Activity Panel کامل Trading

ساختار کامل تب‌دار نسخه پیوست بازیابی شد:

```text
Positions
Orders
Depth
```

این ساختار باعث می‌شود پنل‌های متعدد به‌صورت دائمی زیر نمودار روی هم قرار نگیرند و فضای نمودار حفظ شود.

### 3. DrawerShell قابل استفاده مجدد

در فایل زیر export لازم بازیابی شد:

```text
src/components/workspace/ToolboxDrawers.tsx
```

این تغییر برای اتصال واقعی `TradingToolbox` به Drawerهای موجود ضروری بود.

### 4. اصلاح Strategy clipping

اصلاح نسخه پیوست در فایل زیر حفظ شد:

```text
src/pages/strategies/StrategyPage.css
```

کارت اصلی Strategy دیگر ارتفاع ثابت و `overflow: hidden` ندارد. تنظیمات کلیدی:

```css
height: auto !important;
min-height: 422px !important;
padding: 11px 11px 16px !important;
overflow: visible;
```

این اصلاح مانع بیرون‌زدگی یا غیرقابل‌استفاده شدن دکمه‌های پایین پنل می‌شود.

### 5. بسته قفل‌شده yallist

نسخه قبلی پروژه `package-lock.json` را با این dependency نگه داشته بود:

```text
file:vendor/yallist-3.1.1.tgz
```

اما خود فایل در ZIP وجود نداشت و `npm ci` با `ENOENT` متوقف می‌شد. فایل معتبر نسخه پیوست بازیابی شد:

```text
vendor/yallist-3.1.1.tgz
```

SHA-512 فایل دقیقاً با integrity ثبت‌شده در lockfile یکسان است.

---

## قابلیت‌های نسخه فعلی که حفظ شدند

فایل‌های زیر از نسخه جدیدتر نگه داشته شدند و با نسخه پیوست جایگزین نشدند:

### CSS loading متمرکز

```text
src/main.tsx
src/components/workspace/WorkspaceShell.tsx
src/pages/referenceUi.tsx
```

CSSهای Shell و Reference UI یک بار و به ترتیب قطعی از Entry Point بارگذاری می‌شوند؛ import وابسته به بارگذاری Component دوباره اضافه نشد.

### Light Theme hardening

```text
src/styles/light-theme-hardening.css
src/styles/light-theme-workspace-refinement.css
```

توکن‌ها، سطوح روشن، کنتراست، کارت‌ها، Markets، Orders، Positions، Settings و Strategy polish حفظ شدند.

### Trading toolbox integration layer

فایل جدید زیر اضافه شد:

```text
src/styles/trading-toolbox-integration.css
```

این فایل Toolbox پیوست را با معماری فعلی و Light Theme یکپارچه می‌کند؛ نمودار در ستون اصلی می‌ماند، Order Ticket در ستون راست قرار دارد و ابزارهای ثانویه از Rail باز می‌شوند.

### Backtesting token fix

در فایل Backtesting از متغیر تعریف‌شده زیر استفاده می‌شود:

```css
--bt-soft
```

نسخه پیوست در یک محل از `--bt-surface-soft` استفاده می‌کرد که در قرارداد محلی تعریف نشده بود؛ بنابراین اصلاح نسخه جدیدتر حفظ شد.

---

## فایل‌های نسخه پیوست که عمداً ادغام نشدند

### `ReferenceViews.tsx`

```text
src/components/workspace/ReferenceViews.tsx
```

این فایل هیچ import فعالی نداشت و نسخه قدیمی و یکپارچه صفحات زیر بود:

```text
Watchlist, Orders, Positions, Alerts, History, Analytics, Settings, Help
```

پروژه فعلی برای تمام این صفحات ماژول‌های مستقل، فعال و کامل‌تر دارد. افزودن فایل مرده فقط دو منبع متفاوت برای یک UI ایجاد می‌کرد.

### `workspaceClient.ts`

```text
src/services/workspaceClient.ts
```

این فایل نیز هیچ import فعالی نداشت و endpointهایی را فراخوانی می‌کرد که در `server.ts` نسخه پیوست یا فعلی تعریف نشده‌اند، از جمله:

```text
/api/account/history
/api/account/analytics
/api/help/topics
/api/help/announcements
```

ادغام آن بدون backend contract باعث اضافه‌شدن قابلیت ظاهری اما خراب می‌شد.

### CSS تکراری در مسیر اشتباه

```text
src/pages/pages/strategies/StrategyPage.css
```

مسیر فعال پروژه این است:

```text
src/pages/strategies/StrategyPage.css
```

فایل تکراری import نشده و ادغام نشد.

### فایل اجرایی ناشناس

```text
APEXProjectHub.exe
APEXProjectHub.exe.sha256
```

فایل اجرایی بدون سورس و بدون امکان ممیزی کد، وارد نسخه نهایی نشد. حذف آن هیچ Route، UI، API یا Strategy را حذف نمی‌کند.

### فایل Agent Index

```text
.agent-index/functions_index.json
```

این فایل یک artifact تولیدشده است و منبع اجرایی پروژه نیست. پروژه فعلی Function Index معتبر خود را در `Doc/` دارد.

---

## QA جدید جلوگیری از Regression

فایل زیر اضافه شد:

```text
scripts/qa/verifyAttachedFeatureParity.mjs
```

و در زنجیره اصلی `npm run verify` قرار گرفت.

این QA بررسی می‌کند:

- TradingToolbox حذف نشده باشد؛
- هر چهار Drawer باقی مانده باشند؛
- تب‌های Positions، Orders و Depth باقی مانده باشند؛
- DrawerShell export شده باشد؛
- Strategy clipping fix بازنگشته باشد؛
- yallist tarball با integrity درست داخل پروژه باشد؛
- فایل‌های مرده و Binary ناشناس دوباره وارد پروژه نشوند؛
- Light Theme hardening حفظ شود.

---

## نتایج واقعی بررسی در این محیط

```text
Attached-feature parity:        PASS — 15/15
Workspace light polish:         PASS — 15/15
Light Theme contract:           PASS — 32/32
Design tokens:                  PASS — 5/5
UI Theme merge:                 PASS — 11/11
Reference UI:                   PASS — 24/24
UI interactions:                PASS — 28/28
V20 reference contract:         PASS — 33/33
Backtesting workspace:          PASS — 25/25
Strategy library:               PASS
Strategy engines:               PASS
Strategy integration:           PASS
Consolidation integration:      PASS — 15/15
Adaptive governor:              PASS
System integration:             PASS — 12/12
TS/TSX syntax transpile:         PASS — 267 files
CSS parsing:                    PASS — 28 files / 0 errors
Source secret gate:             PASS
```

## محدودیت Runtime

`npm ci` اکنون دیگر به‌دلیل فایل گمشده `yallist` شکست نمی‌خورد؛ آن نقص برطرف شده است. بااین‌حال Registry داخلی این محیط برای چند package عمومی، از جمله `why-is-node-running`، پاسخ 404 می‌دهد. به همین دلیل اجرای کامل این موارد در همین محیط ممکن نشد:

```text
npx tsc --noEmit
npm test
npm run build
Playwright runtime screenshots
```

این محدودیت مربوط به Registry محیط است، نه فایل گمشده داخل پروژه. روی Registry استاندارد npm باید Release Gate زیر اجرا شود:

```bash
npm ci
npm run lint
npm test
npm run build
npm run verify
npm run verify:visual
```

---

## جمع‌بندی

نسخه `1.0.43` تمام قابلیت فعال و قابل استفاده نسخه پیوست را حفظ کرده است. تنها فایل‌های حذف‌شده از نسخه پیوست، فایل‌های مرده، تکراری، بدون backend، تولیدشده یا غیرقابل ممیزی بوده‌اند. قابلیت‌های جدیدتر Light Theme، CSS loading، QA و UI polish نیز حفظ شده‌اند.
