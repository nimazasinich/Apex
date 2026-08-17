# گزارش ارتقای Observability و Runtime QA پروژه APEX

## نسخه

```text
1.0.36
```

## هدف این مرحله

این مرحله ادامه مستقیم ادغام ابزارهای Trading Engine بود. تمرکز روی دو خلأ باقی‌مانده قرار گرفت:

1. ابزارهای Shadow و Streaming جدید در رابط عملیاتی قابل مشاهده نبودند.
2. اسکریپت‌های QA موجود برای Fresh Mount، Responsive، Theme و Watchlist پراکنده، دارای پورت ثابت و وابسته به مرورگر خاص بودند.

هیچ Strategy Engine، مسیر ثبت سفارش، محاسبه مالی یا Scanner Gate در این مرحله تغییر نکرد.

---

## ۱. ارتقای System Health Drawer

فایل اصلی:

```text
src/components/workspace/SystemHealthDrawer.tsx
```

Drawer اکنون به‌صورت هم‌زمان و مستقل این Endpointها را می‌خواند:

```text
GET /api/system/health
GET /api/operations/status
GET /api/operations/adaptive-thresholds/fast-shadow?minSamples=24
GET /api/operations/market-streaming
GET /api/operations/market-statistics?limit=12
```

رفتار جدید:

- هر Endpoint مستقل خطا می‌خورد و خرابی یک بخش کل Drawer را از کار نمی‌اندازد.
- Last-known data برای Endpoint ناموفق حفظ می‌شود.
- خطای Partial refresh صریح نمایش داده می‌شود.
- KuCoin، Binance، Operations service و Uptime در کارت‌های بالایی دیده می‌شوند.
- وضعیت Providerها، Decision Memory، Fast Adaptive Shadow و Public Streaming در Control Plane نمایش داده می‌شوند.
- پیشنهادهای Adaptive فقط با برچسب Shadow-only نمایش داده می‌شوند.
- هیچ دکمه Apply خودکار برای Recommendation ایجاد نشده است.
- Streaming به‌صورت Execution-independent و Default-off نشان داده می‌شود.

فایل Client Aggregator:

```text
src/services/operationsDiagnostics.ts
```

این سرویس شامل موارد زیر است:

- دریافت موازی Endpointها؛
- Partial-failure isolation؛
- Last-known-good merge؛
- خلاصه‌سازی Fail-closed برای UI؛
- انتخاب Horizon صحیح 1m/5m؛
- جلوگیری از ساخت داده جایگزین یا Synthetic.

---

## ۲. Endpoint آمار آنلاین بازار

Endpoint جدید:

```text
GET /api/operations/market-statistics?limit=12
```

خروجی:

- تعداد Symbolهای موجود در Registry؛
- آخرین Symbolهای مشاهده‌شده؛
- EWMA مربوط به OBI؛
- EWMA مربوط به ATR و Volume Delta در صورت وجود؛
- Welford sample count و distribution snapshot؛
- زمان آخرین استفاده از هر Symbol؛
- برچسب صریح `shadowOnly: true`؛
- برچسب صریح `executionDependency: false`.

این Endpoint از Registry محدودشده موجود استفاده می‌کند و به مسیر سفارش یا Scanner Gate وصل نیست.

فایل تغییرکرده:

```text
src/services/onlineStatistics.ts
```

متد جدید:

```text
listSnapshots(limit)
```

برای جلوگیری از ترتیب نامطمئن در چند Update داخل یک میلی‌ثانیه، LRU اکنون علاوه بر Timestamp از ترتیب داخلی یکنواخت استفاده می‌کند.

---

## ۳. نمایش آمار آنلاین در رابط

System Health Drawer اکنون جدول محدودی برای Symbolهای اخیر دارد:

- Symbol
- Smoothed OBI
- Sample count
- ATR

این جدول فقط Observability است و هیچ‌کدام از اعداد آن به‌عنوان سیگنال اجرایی یا توصیه معامله نمایش داده نمی‌شوند.

CSS اصلی:

```text
src/components/workspace/OperationsDrawers.css
```

طراحی با تم فعلی APEX، Light/Dark variables و Drawer موجود هماهنگ شده است.

---

## ۴. Runtime QA یکپارچه

فایل جدید:

```text
scripts/qa/verifyWorkspaceRuntime.mts
```

Script جدید جایگزین مستقیم Scriptهای پراکنده قدیمی نیست، بلکه منطق مفید آن‌ها را در یک Runner قابل تنظیم جمع می‌کند.

### Fresh Mount

Routeهای زیر هر کدام در Browser Context تازه باز می‌شوند:

```text
overview
markets
watchlist
portfolio
trading
orders
positions
alerts
history
analytics
backtesting
strategies
settings
help
```

بررسی‌ها:

- Root خالی یا ناقص؛
- Page Error؛
- Console Error؛
- Request Failure؛
- پاسخ 4xx/5xx؛
- خرابی Direct Route؛
- Horizontal page overflow.

### Responsive matrix

صفحات کلیدی:

```text
overview
orders
positions
settings
```

ابعاد:

```text
1280×720
1368×753
1440×900
1920×1080
684×377  ← نمای مؤثر 1368×753 در Zoom 200%
```

### Theme persistence

- Forced Light
- Forced Dark
- Hard reload
- بررسی `data-apex-theme`
- بررسی `data-apex-theme-resolved`

### Watchlist persistence

کلید واقعی پروژه:

```text
apex_watchlist_favorites_v1
```

Symbolهای واقعی:

```text
BTC-USDT
ETH-USDT
```

### خروجی

```text
test-results/workspace-runtime/workspace-runtime-report.json
```

Screenshotهای Settings، Positions، Theme و Watchlist نیز داخل همان پوشه ذخیره می‌شوند.

### تنظیمات Runner

```text
APEX_QA_BASE_URL
APEX_QA_PORT
APEX_QA_OUT_DIR
APEX_QA_STRICT
APEX_QA_START_SERVER
BROWSER_CHANNEL
HEADLESS
```

Runner در صورت نبود Server می‌تواند آن را خودکار اجرا کند و برای Browser ابتدا Channel اختیاری و سپس Playwright Chromium را امتحان می‌کند.

Scriptهای Package:

```text
npm run qa:workspace-runtime
npm run verify:visual
```

`verify:visual` اکنون QA مرجع 1368×753 و Runtime matrix را پشت سر هم اجرا می‌کند.

---

## ۵. Postman Collection

در Collection موجود درخواست زیر اضافه شد:

```text
Online Market Statistics
```

مسیر:

```text
GET {{baseUrl}}/api/operations/market-statistics?limit=12
```

هیچ Token واقعی یا درخواست ثبت سفارش زنده اضافه نشده است.

---

## فایل‌های جدید

```text
APEX_OPERATIONS_OBSERVABILITY_RUNTIME_QA_REPORT_FA.md
scripts/qa/verifyWorkspaceRuntime.mts
src/services/operationsDiagnostics.ts
src/tests/operationsDiagnostics.test.ts
```

## فایل‌های تغییرکرده

```text
package.json
package-lock.json
server.ts
PROJECT_HANDOFF.md
scripts/qa/verifyTradingEngineUtilities.mts
src/components/workspace/OperationsDrawers.css
src/components/workspace/SystemHealthDrawer.tsx
src/services/onlineStatistics.ts
src/tests/onlineStatistics.test.ts
tools/postman/APEX-Unified-Terminal.postman_collection.json
```

---

## اعتبارسنجی انجام‌شده

### موفق

```text
git diff --check
```

```text
Strict custom TypeScript check:
operationsDiagnostics
onlineStatistics
fastAdaptiveShadowController
operationsStatus
apiQuery
```

```text
Syntax transpile:
server.ts
SystemHealthDrawer.tsx
verifyWorkspaceRuntime.mts
verifyTradingEngineUtilities.mts
new/modified tests and services
```

```text
Manual emitted-JS assertions:
recent-symbol ordering
bounded statistics snapshot
partial diagnostics
streaming execution independence
tracked-symbol summary
```

```text
CSS parse with tinycss2
Postman JSON parse
Source-only release secret gate
```

### محدودیت محیط

به‌علت نبود `node_modules` و خطای Registry برای وابستگی قبلی پروژه، موارد زیر در این Container اجرا نشدند:

```text
npm ci
npx tsc --noEmit
npm test
npm run build
npm run qa:workspace-runtime
```

Runtime QA به Playwright و اجرای Server واقعی نیاز دارد و باید پس از نصب موفق Dependencies روی سیستم اصلی اجرا شود.

---

## وضعیت ایمنی نهایی

```text
Fast Adaptive: shadow-only
Recommendation applied: false
Public streaming: default disabled
Streaming execution dependency: false
Online statistics: shadow-only
Live order path changed: no
Financial calculations changed: no
Scanner gates changed: no
```

## گیت نهایی روی سیستم اصلی

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```
