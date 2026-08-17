# گزارش اصلاح Strategy Studio و Backtesting — APEX v1.0.45

## نتیجه بررسی
مشکل صرفاً ظاهری نبود. سه ایراد اصلی در نسخه قبل وجود داشت:

1. **بخشی از داده‌های نمای Strategy حالت Preview داشتند** و پیش از اجرای Replay یا Validation، ظاهری شبیه نتیجه واقعی ایجاد می‌کردند.
2. **ارتفاع ناحیه Chart در Backtesting توسط چیدمان سه‌ستونه فشرده می‌شد**؛ در نتیجه نمودار بسیار کوتاه دیده می‌شد.
3. **افق داده Backtest کوتاه بود و درخواست‌های طولانی‌تر Pagination واقعی نداشتند**؛ بنابراین برخی استراتژی‌ها فرصت کافی برای تولید Setup و Trade نداشتند.

این سه مورد در نسخه 1.0.45 اصلاح شده‌اند.

---

## اصلاحات Strategy Studio

- تمام Sparklineها، درصدها و نمودارهای نمایشیِ ثابت حذف شدند.
- هیچ Win Rate، Return، Drawdown، Profit Factor یا Score پیش از اجرای واقعی نمایش داده نمی‌شود.
- کارت‌های بدون نتیجه با عبارت‌های شفاف `Run required` و `No generated evidence yet` نمایش داده می‌شوند.
- نتیجه Backtest از مسیر واقعی زیر دریافت می‌شود:
  - `GET /api/market/backtest`
- Validation از مسیر واقعی زیر اجرا می‌شود:
  - `POST /api/strategies/:strategyId/validate`
- نتیجه Walk-forward Validation اکنون مستقیماً در State رابط کاربری ثبت می‌شود و این موارد را به‌روز می‌کند:
  - Validation Score
  - Win Rate
  - Net Return
  - Max Drawdown
  - Profit Factor
  - Cost-stress status
- دکمه‌های View Details، Compare، Run Backtest و Save Strategy در پایین کارت ثابت و قابل دسترس باقی می‌مانند.
- ستون اصلی و ستون‌های جانبی اسکرول مستقل دارند و دیگر دکمه‌ها زیر پنل یا خارج از محدوده قابل استفاده قرار نمی‌گیرند.
- مدل‌های فاقد زیرساخت لازم به‌صورت صریح `Blocked/Experimental` باقی می‌مانند و قابل اجرا وانمود نمی‌شوند.

---

## اصلاحات Backtesting

- مقدار پیش‌فرض History به **2,000 کندل بسته‌شده** افزایش یافت.
- انتخاب‌های History اکنون شامل موارد زیر است:
  - 500
  - 1,000
  - 2,000
  - 3,000
  - 5,000 کندل
- Max Hold قابل تنظیم شد:
  - 12، 24، 48، 72، 120 و 240 کندل
- ارتفاع نمودار به‌صورت قطعی بین 290 تا 390 پیکسل تعریف شد.
- ستون Setup، Results و Insights اسکرول مستقل دارند و نمودار دیگر به نوار باریک تبدیل نمی‌شود.
- اگر معامله‌ای ایجاد شود، Equity Curve واقعی نمایش داده می‌شود.
- اگر Replay با موفقیت اجرا شود اما هیچ معامله‌ای واجد شرایط نباشد:
  - نمودار واقعی قیمت نرمال‌شده بازار نمایش داده می‌شود؛
  - دلیل عدم ایجاد معامله از Diagnostics سرور نمایش داده می‌شود؛
  - UI دیگر خالی یا بدون واکنش باقی نمی‌ماند.
- Commission، Slippage و Funding از UI به موتور Replay ارسال می‌شوند و در Backend اعمال می‌شوند.
- نتیجه شامل Audit، Runtime، Decision Funnel، Rejection Reasons و Data Source است.

---

## اصلاحات Backend

### تاریخچه واقعی و بلندمدت
فایل `src/services/marketDataService.ts` اکنون برای درخواست‌های بیش از 999 کندل، تاریخچه Binance Futures را با `endTime` صفحه‌بندی می‌کند.

ویژگی‌ها:

- حداکثر 5,000 کندل؛
- حذف کندل باز؛
- مرتب‌سازی زمانی؛
- Deduplication؛
- حفظ Data State و Source؛
- عدم تولید داده مصنوعی در صورت شکست Provider.

### موتور Backtest
پاسخ Backtest اکنون علاوه بر معاملات شامل موارد زیر است:

- `equityCurve`
- `marketCurve`
- `diagnostics`
- `runtime`
- `acceptedCandidates`
- `rejectedCandidates`
- `rejectionCounts`
- `costModel`
- `audit`

### اصلاح Runtime Parameters
در Scanner-preset strategyها، پارامترهایی که کاربر از Strategy Detail تغییر می‌دهد اکنون واقعاً به موتور منتقل می‌شوند.

- فقط پارامترهای تعریف‌شده پذیرفته می‌شوند؛
- مقادیر عددی در Min/Max مجاز Clamp می‌شوند؛
- پارامتر ناشناخته نادیده گرفته می‌شود؛
- Neighbor runs در Validation واقعاً تنظیمات متفاوت اجرا می‌کنند.

### Walk-forward Validation
Validation اکنون از 2,400 کندل استفاده می‌کند و حداقل 1,200 کندل معتبر لازم دارد.

مراحل:

- سه پنجره Walk-forward؛
- یک Holdout؛
- Cost Stress؛
- Parameter Stability؛
- Reproducibility؛
- Ranking واقعی بر اساس گزارش Validation.

### اصلاح ورودی پیش‌فرض
یک باگ عددی در مقدار پیش‌فرض Bars شناسایی و اصلاح شد. مقدار رشته‌ای نامعتبر `2_000` به Parsing محدود و Fail-safe تبدیل شد؛ در نتیجه حتی درخواست بدون Query نیز 2,000 کندل و Max Hold برابر 72 دریافت می‌کند.

---

## تست‌ها و QA انجام‌شده

- Strategy Library: PASS
- Strategy Integration: PASS
- Strategy Engine Smoke: PASS
- Backtesting Workspace: 25/25 PASS
- Strategy/Backtest Production: 21/21 PASS
- System Integration: 12/12 PASS
- Light Theme: 32/32 PASS
- Trading Drawer Docking: 11/11 PASS
- Attached Feature Parity: 15/15 PASS
- Workspace Light Polish: 15/15 PASS
- Reference UI: 24/24 PASS
- UI Interaction: 28/28 PASS
- Consolidation: 15/15 PASS
- V19 Contract: 10/10 PASS
- V20 Contract: 33/33 PASS
- TypeScript-family syntax transpilation: 274 files, zero syntax errors
- Source secret gate: PASS

در Smoke Test، بعضی استراتژی‌ها معامله تولید کردند و بعضی در داده آزمون هیچ معامله‌ای نداشتند. صفر معامله در این حالت به‌عنوان نتیجه معتبر و قابل توضیح نمایش داده می‌شود، نه به‌عنوان خرابی یا نتیجه ساختگی.

---

## محدودیت اعتبارسنجی این محیط

نصب کامل Dependencies در این محیط به‌دلیل 404 رجیستری داخلی روی `vitest@4.1.10` تکمیل نشد؛ بنابراین اجرای کامل موارد زیر در این کانتینر ممکن نبود:

```bash
npm run lint
npm test
npm run build
npm run verify:visual
```

تست‌های Static، Syntax، Engine Smoke و Contract QA اجرا شده‌اند. پیش از استقرار Production، Release Gate کامل باید روی سیستمی با دسترسی سالم به npm registry اجرا شود.
