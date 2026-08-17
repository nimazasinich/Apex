# گزارش پیاده‌سازی APEX Backtesting Lab — Reference Alignment + Robust Positive-Evidence Logic

تاریخ: 2026-08-09  
نسخه پایه: APEX v1.0.56

## نتیجه اجرایی

Backtesting Lab به‌صورت brownfield و در همان معماری موجود اصلاح شد؛ صفحه از نو نوشته نشده و مسیرهای واقعی replay، optimizer، evidence، export، fullscreen، presets، notes/history و Research Matrix حفظ شده‌اند.

هدف «نتیجه مثبت» با دستکاری P&L یا ساختن خروجی جعلی پیاده‌سازی نشده است. به‌جای آن، منطق انتخاب و promotion سخت‌گیرانه‌تر شده تا فقط evidence مثبت و robust بتواند وارد paper multi-trading یا پروفایل بهینه‌شده شود. اگر evidence کافی نباشد، سیستم fail-closed می‌ماند و نتیجه مثبت جعل نمی‌کند.

## اصلاحات UI در 1368×753

- Grid اصلی Backtesting در viewport هدف: `390px + minmax(0, 1fr)` با gap 12px.
- ردیف‌های Market / Timeframe / Requested period و History bars / Maximum hold / Direction به ساختار سه‌ستونه reference نزدیک شدند.
- Strategy parameters در viewport هدف سه‌ستونه شدند.
- Evidence Area از border/geometry اضافی پاک شد و dominant باقی می‌ماند.
- Replay identity اکنون شش metric cell در یک ردیف دارد.
- pre-run status از `NO RESULT` به `READY TO RUN` تغییر کرد، مگر در حالت blocked/error/cancelled.
- SVG پیوست‌شده‌ی کاربر دقیقاً جایگزین asset Hero پروژه شد.
- Hero ترتیب reference را دارد: متن سمت چپ، illustration سمت راست.
- Workflow واقعی `Configure → Run → Review` حفظ و برجسته شد.
- تب‌های `Output Overview / Evidence Notes / Run History` قبل از اولین اجرا نیز قابل مشاهده‌اند؛ سایر تب‌های موجود حذف نشده‌اند و بعد از آن‌ها باقی مانده‌اند.
- Empty state پایین Evidence Area اکنون CTA واقعی Run Backtest و توضیح صادقانه‌ی وضعیت دارد و دیگر فضای خالی بزرگ نیست.
- banner تمام‌عرض Autopilot که با reference تضاد داشت حذف شد؛ قابلیت Autopilot حذف نشده و در بخش جمع‌وجور Robust Optimization حفظ شده است.
- Robust Optimization به‌صورت collapsible قرار گرفته تا feature جدید باعث تخریب density و reference match نشود.

## اصلاح مهم منطق Optimizer

یک مشکل integration واقعی برطرف شد: Backend می‌توانست یک StrategyOptimizationProfile را promote کند، اما Backtesting UI همیشه parameterهای خودش را صریح در request می‌فرستاد. مطابق contract موجود، parameter صریح کاربر بر promoted default اولویت دارد؛ بنابراین UI defaultهای قدیمی می‌توانستند عملاً profile جدید Backend را shadow کنند.

اکنون:

1. Backtesting state مربوط به optimizer را برای context دقیق `strategy + symbol + interval + direction` از backend hydrate می‌کند.
2. promoted profile به پارامترهای UI اعمال می‌شود، مگر این‌که کاربر عمداً parameter را تغییر داده باشد.
3. user override با ref مستقل track می‌شود؛ system-promoted parameter به اشتباه user override محسوب نمی‌شود.
4. تغییر context، optimization request قدیمی را abort می‌کند تا profile/report اشتباه روی context جدید اعمال نشود.
5. manual `Optimize safely` از همان endpoint واقعی `/api/strategies/:strategyId/optimize` استفاده می‌کند.
6. candidate فقط بعد از gateهای existing optimizer نمایش داده می‌شود: chronological windows، purge/embargo، untouched holdout، cost stress، drawdown/sample/overfit gates و neighbor stability.
7. promotion فقط با `reportGeneratedAt` دقیق انجام می‌شود؛ stale review قابل promote شدن نیست.
8. UI با `sourceReportAt === generatedAt` تشخیص می‌دهد candidate فعلی واقعاً همان report promote‌شده است یا یک profile قدیمی‌تر فعال است.

## بهبود منطق Multi-Agent / Multi-Trading

Research Matrix و council پنج-agent موجود حفظ شدند. علاوه بر vetoهای council، انتخاب اولیه paper portfolio سخت‌گیرانه‌تر شد.

قبلاً utility مثبت می‌توانست برای ورود به paper portfolio کافی باشد. اکنون هر candidate علاوه بر utility مثبت باید همزمان این شروط را داشته باشد:

- `totalPnlPct > 0`
- `profitFactor > 1`
- `tradeCount >= 4`
- requested history کامل و معتبر (قانون قبلی همچنان برقرار است)

سپس Multi-Agent Research Council نیز gate سخت‌گیرانه‌تر خودش را اعمال می‌کند (از جمله positive return، profit factor، minimum sample، drawdown، conflict و execution guardian). بنابراین ranking می‌تواند candidate ضعیف را برای evidence نشان دهد، اما paper portfolio آن را به‌عنوان موقعیت مثبت انتخاب نمی‌کند.

این تغییر عمداً fail-closed است: paper portfolio خالی از انتخاب candidate منفی یا کم‌نمونه بهتر است.

## Evidence مثبت کنترل‌شده

Runtime تست optimizer روی fixture قطعی، baseline منفی را به candidate مثبت روی **untouched holdout** رساند:

- Baseline holdout P&L: `-0.24%`
- Candidate holdout P&L: `+11.64%`
- Cost-stress P&L: `+11.28%`
- Profit factor: `2.25`
- Trades: `24`
- Neighbor pass rate: `100%`
- Promotion blockers: `[]`
- Eligible: `true`

این fixture مصنوعی و deterministic است و فقط correctness منطق optimization/gating را ثابت می‌کند؛ پیش‌بینی سود بازار واقعی نیست.

Smoke تست bespoke engines نیز deterministic بود و در fixture خودش سه موتور خروجی مثبت داشتند:

- Adaptive Trend Portfolio: `+14.0758%` روی 12 معامله
- Volatility Squeeze Expansion: `+1.4920%` روی 1 معامله
- Regime Routed Composite: `+6.9436%` روی 9 معامله

موتورهای بدون setup معتبر در همان fixture صفر معامله باقی ماندند؛ نتیجه برای مثبت جلوه دادن جعل نشد.

## QA انجام‌شده

- Backtesting workspace source contract: **25/25 PASS**
- Strategy optimization integration: **26/26 PASS**
- Multi-agent / multi-trading source contract: **20/20 PASS**
- Multi-agent / paper multi-trading runtime: **14/14 PASS**
- Unified safety runtime: **11/11 PASS**
- Strategy optimizer safety runtime: **7/7 PASS**
- Reference + optimization contract جدید: **19/19 PASS**
- Strategy engine deterministic smoke: **PASS** برای هر پنج bespoke runner
- TypeScript syntax transpilation روی فایل‌های تغییرکرده: **PASS**
- Test inventory: سالم (و تست regression جدید برای positive-evidence paper portfolio اضافه شد)
- Version identity: **PASS**

## محدودیت محیطی

Fresh dependency install/build در این sandbox قابل تکمیل نبود. `npm ci` در registry داخلی روی `vitest@4.1.10` با HTTP 404 متوقف شد. به همین دلیل:

- full `tsc --noEmit` به علت نبود `vite/client` قابل تکمیل نیست؛
- fresh Vite production bundle ساخته نشد؛
- screenshot runtime تازه از source اصلاح‌شده تولید نشد.

این محدودیت از package registry محیط است، نه از خطای source بررسی‌شده. فایل‌های QA dependency-independent و runtimeهایی که خودشان TypeScript را transpile می‌کنند اجرا شده‌اند.

## Failureهای قبلی و خارج از scope

دو check قبلی در صفحات unrelated همچنان وجود دارند و در این تغییر دستکاری نشدند:

- Reference UI: Positions screenshot layout
- UI interaction: Positions eleven-column contract
- Agent Safe Merge: Stage UI text-size check

مطابق brief، برای نزدیک‌کردن Backtesting Lab به reference کد unrelated Trading/Positions دستکاری نشد.

## فایل‌های اصلی تغییرکرده

- `src/pages/backtesting/BacktestingPage.tsx`
- `src/pages/backtesting/BacktestRunBuilder.tsx`
- `src/pages/backtesting/BacktestRunHeader.tsx`
- `src/pages/backtesting/BacktestEvidenceHero.tsx`
- `src/pages/backtesting/BacktestEvidenceTabs.tsx`
- `src/pages/backtesting/BacktestingPage.css`
- `src/assets/backtesting/apex-backtesting-evidence-hero.svg`
- `src/services/multiStrategyResearchOrchestrator.ts`
- `src/tests/multiStrategyResearchOrchestrator.test.ts`
- `scripts/qa/runMultiAgentMultiTradingRuntime.mjs`
- `scripts/qa/runStrategyOptimizationSafetyRuntime.mjs`
- `scripts/qa/verifyBacktestingReferenceOptimization.mjs`
- `package.json`

## اصل نهایی

سیستم اکنون برای رسیدن به نتیجه مثبت، candidate را **بهینه و اعتبارسنجی** می‌کند و multi-agent/paper selection را روی evidence مثبت محدود می‌کند؛ اما اگر داده واقعی این شرایط را برآورده نکند، نتیجه مثبت اعلام نمی‌کند. این رفتار برای Backtesting قابل اعتمادتر از تغییر thresholdها فقط برای سبزکردن P&L است.
