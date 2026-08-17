# گزارش یکپارچه‌سازی زیرسیستم‌های مرجع APEX

تاریخ: 2026-08-05  
نسخه پروژه: `1.0.34`  
مسیر کاری این سشن: `/mnt/data/apex_impl/current`

## هدف

دو آرشیو مرجع زیر با نسخه جاری APEX مقایسه شدند:

- `APEX-frontend-phase2 (4).zip`
- `apex-trading-engine_reference-reconstruction-v2.zip`

هدف، استخراج قابلیت‌هایی بود که در نسخه جاری وجود نداشتند یا در آرشیو مرجع از نظر معماری کامل‌تر بودند؛ بدون بازنویسی پروژه، تغییر قراردادهای API، حذف قابلیت‌ها، جایگزینی موتورهای استراتژی فعلی یا اضافه‌کردن داده ساختگی.

## جمع‌بندی تصمیم فنی

هیچ موتور استراتژی معاملاتی داخل آرشیوهای مرجع از Strategy Library فعلی APEX کامل‌تر نبود. بنابراین هیچ Strategy Engine قدیمی جایگزین یا به‌صورت موازی وارد نشد. قابلیت‌های ارزشمند مرجع به‌عنوان زیرسیستم‌های مشاهده‌پذیری، چرخه‌عمر، اعلان و مدیریت منابع داده روی معماری فعلی ادغام شدند.

## قابلیت‌های پیاده‌سازی‌شده

### 1. Direction Divergence چندتایم‌فریمی

فایل اصلی:

```text
src/services/directionDivergence.ts
```

قابلیت‌ها:

- تحلیل مستقل روند در تایم‌فریم‌های `1m`, `5m`, `15m`, `1h`؛
- استفاده از EMA20، شیب نرمال‌شده با ATR و ساختار Higher High / Lower Low؛
- دسته‌بندی سیگنال به:
  - `WITH_TREND`
  - `RANGE`
  - `COUNTER_TREND`
  - `UNAVAILABLE`
- محاسبه Alignment Score، Trend Strength، Timeframe Agreement و Data Completeness؛
- ثبت منبع داده و شواهد هر تایم‌فریم؛
- اجرای کامل به‌صورت `shadowOnly` بدون اثر بر رتبه‌بندی، Risk Gate یا ارسال سفارش.

ادغام در:

```text
src/services/apexNextMarketRoutes.ts
src/App.tsx
src/pages/watchlist/WatchlistPage.tsx
src/services/shadowComparisonPersistence.ts
src/types.ts
```

### 2. Signal Lifecycle State Machine

فایل‌های اصلی:

```text
src/services/lifecycleCore.ts
src/services/signalLifecycleTracker.ts
```

چرخه:

```text
CANDIDATE → CONFIRMED → ACTIVE → INVALIDATED / EXPIRED
```

قابلیت‌ها:

- نیاز به دو تیک معتبر متوالی برای تأیید؛
- پنجره سه‌تیکی برای جلوگیری از ابطال بر اثر نویز لحظه‌ای؛
- بی‌اثرکردن داده Confluence ناموجود به‌جای تفسیر آن به‌عنوان شکست؛
- نیاز به دو تیک معکوس OBI برای Invalid شدن سیگنال فعال؛
- TTL و سقف پنج تیک stale؛
- تشخیص `WIN`, `LOSS`, `BREAKEVEN`؛
- فریز Entry، Stop Loss و Take Profit در زمان ایجاد thesis؛
- نگهداری shadow lifecycle در Local Storage با کلید:
  `apex.signal-lifecycle.shadow.v1`؛
- re-arm کنترل‌شده پس از خروج سیگنال از اسکن؛
- عدم تغییر در معامله، ترتیب کاندیداها یا محاسبات مالی.

### 3. Signal ID و اتصال نتیجه به Decision Memory

فایل‌ها:

```text
src/utils/signalId.ts
src/services/decisionOutcome.ts
```

قابلیت‌ها:

- تخصیص Signal ID خوانا و پایدار برای اتصال داده‌های همان thesis؛
- اتصال Closure دقیقاً به Decision ثبت‌شده با Signal ID؛
- جلوگیری از fallback اشتباه به نماد در صورت وجود Signal ID؛
- ثبت `laterOutcome` و `laterPnl` در Decision Memory؛
- پشتیبانی از نتیجه‌های WIN، LOSS، BREAKEVEN و EXPIRED.

### 4. Telegram Settings و اعلان‌های چرخه‌عمر

فایل‌ها:

```text
src/services/telegram.ts
src/components/TelegramSettingsPanel.tsx
```

ادغام در:

```text
src/pages/settings/SettingsPage.tsx
src/pages/settings/SettingsPage.css
src/App.tsx
```

قابلیت‌ها:

- استفاده از endpointهای موجود سمت سرور؛
- ثبت Token و Chat ID به‌صورت write-only؛
- بررسی وضعیت اتصال؛
- ارسال پیام آزمایشی؛
- فعال/غیرفعال‌کردن رویدادها؛
- اعلان Candidate، Confirmed، Expired/Invalidated، TP، SL و Data Degraded؛
- جلوگیری session-level از پیام‌های تکراری؛
- اعلان Data Degraded با dedupe ساعتی بر اساس منبع و وضعیت؛
- عدم بازگرداندن credential از سرور به مرورگر.

### 5. Intelligence Sources / Supplemental Providers

فایل‌ها:

```text
src/services/supplementalSettings.ts
src/services/externalApiSources.ts
src/components/IntelligenceSourcesSettingsPanel.tsx
```

ادغام در بخش `API management` صفحه Settings.

قابلیت‌ها:

- نمایش Health منابع News، Sentiment و On-chain؛
- مدیریت شش provider مکمل؛
- ثبت کلیدها به‌صورت write-only؛
- Probe و نمایش نتیجه verification؛
- تنظیم queryهای NewsAPI؛
- ساخت Custom Source Profile با URL، Method، Auth و Parser؛
- Restore profileهای پیش‌فرض پروژه؛
- برچسب شفاف Dormant تا زمان وجود typed adapter؛
- استفاده از endpoint تست موجود با محافظ SSRF سمت سرور.

### 6. Level Ladder و Execution Corridor

فایل‌ها:

```text
src/components/trading/ExecutionIntelligence.tsx
src/components/trading/LevelLadderPanel.tsx
src/components/trading/ExecutionCorridorPanel.tsx
src/components/trading/ExecutionIntelligence.css
```

ادغام در:

```text
src/components/workspace/AccountViews.tsx
```

قابلیت‌ها:

- نمایش پویا و بدون داده ساختگیِ Entry، SL و TPها؛
- محاسبه Gross R/R از داده واقعی Trade Plan؛
- نمایش Market Price در Ladder؛
- ترسیم Corridor ریسک/ورود/اهداف؛
- نمایش Plan Validity و Blocking Reason؛
- نمایش Risk، Size، Costs و Expected Net Edge؛
- نمایش Direction Divergence و Lifecycle به‌عنوان observability؛
- شمارش زنده TTL با interval دارای cleanup؛
- طراحی scoped برای Light و Dark.

### 7. Signal Intelligence در Watchlist

فایل‌ها:

```text
src/pages/watchlist/WatchlistPage.tsx
src/pages/watchlist/WatchlistPage.css
```

قابلیت‌ها:

- Lifecycle state و Signal ID؛
- Direction category؛
- Alignment، Strength، Agreement و Completeness؛
- evidence هر تایم‌فریم؛
- برچسب صریح Shadow-only؛
- rail داخلی scrollable بدون overflow در سطح کل صفحه.

## فایل‌های تغییرکرده

```text
src/App.tsx
src/components/workspace/AccountViews.tsx
src/pages/settings/SettingsPage.css
src/pages/settings/SettingsPage.tsx
src/pages/watchlist/WatchlistPage.css
src/pages/watchlist/WatchlistPage.tsx
src/services/apexNextMarketRoutes.ts
src/services/shadowComparisonPersistence.ts
src/types.ts
```

## فایل‌های جدید

```text
src/components/IntelligenceSourcesSettingsPanel.tsx
src/components/TelegramSettingsPanel.tsx
src/components/trading/ExecutionCorridorPanel.tsx
src/components/trading/ExecutionIntelligence.css
src/components/trading/ExecutionIntelligence.tsx
src/components/trading/LevelLadderPanel.tsx
src/services/decisionOutcome.ts
src/services/directionDivergence.ts
src/services/externalApiSources.ts
src/services/lifecycleCore.ts
src/services/signalLifecycleTracker.ts
src/services/supplementalSettings.ts
src/services/telegram.ts
src/tests/decisionOutcome.test.ts
src/tests/directionDivergence.test.ts
src/tests/lifecycleCore.test.ts
src/tests/signalId.test.ts
src/tests/signalLifecycleTracker.test.ts
src/tests/telegram.test.ts
src/utils/signalId.ts
```

## تست‌ها و اعتبارسنجی

### موفق

- `git diff --check`: موفق؛
- جست‌وجوی الگوهای رایج Secret در فایل‌های جدید/تغییرکرده: موردی پیدا نشد؛
- Transpile Syntax تمام 26 فایل TS/TSX جدید و تغییرکرده با TypeScript 5.8.3: صفر خطای Syntax؛
- Parse سه stylesheet جدید/تغییرکرده با PostCSS: موفق؛
- تست‌های دستی زیرسیستم‌های pure: موفق؛
- تست مسیر lifecycle از Candidate تا Confirmed، Active و Closure: موفق؛
- `npm run qa:strategy-library`: موفق؛
- `npm run qa:strategy-engines`: موفق؛
- `npm run qa:strategy-integration`: موفق.

### شکست‌های baseline و نامرتبط با این ادغام

- `qa:backtesting-workspace`: 24/25؛ تنها mismatch مربوط به انتظار قدیمی عرض ستون Settings است؛
- `qa:reference-ui`: تنها failure مربوط به وجود stylesheet قدیمی `v3-workspace.css` است؛
- `qa:consolidation`: دو failure مربوط به duplicate/disconnected paths موجود در baseline است.

### قابل اجرا نبودن در این محیط

دستورات استاندارد زیر در محیط فعلی اجرا نشدند، چون `node_modules` در آرشیو نبود و registry داخلی برای چند dependency پاسخ 404 داد:

```text
npm run lint
npm test
npm run build
```

خطای محیطی شامل نبودن executableهای `vitest` و `tsx` و type packageهای Vite بود. بنابراین این گزارش ادعای موفقیت Full Build یا Full Vitest ندارد. روی سیستم دارای دسترسی registry باید اجرا شود:

```cmd
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

## وضعیت امنیت بسته تحویلی

نسخه ZIP نهایی از یک staging پاک‌سازی‌شده ساخته می‌شود و موارد زیر در آن قرار نمی‌گیرند:

- `.env`, `.env.txt` و هر runtime credential file؛
- `.external-api-sources.config.json` واقعی؛
- `.telegram*.config.json` و `.supplemental*.config.json` واقعی؛
- `.git`, `node_modules`, `dist`, coverage و گزارش‌های قدیمی؛
- آرشیوهای تاریخی حاوی فایل‌های تنظیمات.

فایل‌های نمونه مانند `.env.example` و `.external-api-sources.config.example.json` حفظ می‌شوند.

## نتیجه

قابلیت‌های مفید آرشیو مرجع بدون تضعیف معماری فعلی و بدون جایگزینی Strategy Engineهای پیشرفته‌تر APEX پیاده‌سازی شدند. تمام بخش‌هایی که می‌توانند روی تصمیم معاملاتی اثر بگذارند، در این مرحله Shadow-only هستند تا ابتدا قابلیت ارزیابی و audit فراهم شود.
