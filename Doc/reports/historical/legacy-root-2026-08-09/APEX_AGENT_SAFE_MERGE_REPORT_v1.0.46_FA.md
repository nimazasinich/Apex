# گزارش ممیزی و ادغام امن پروژه ایجنت — APEX v1.0.46

## نتیجه نهایی

روند ایجنت از نظر تشخیص فایل CSS فعال **در اصل درست** بود: تغییر باید در `src/index.css` اعمال می‌شد و ویرایش `legacy-compat.css` اثری روی Runtime نداشت، چون این فایل هیچ‌جا import نشده بود.

با این حال، نسخه ایجنت به‌صورت کامل جایگزین پروژه اصلی نشد؛ زیرا پروژه تولیدی v1.0.45 در چند بخش از آن جدیدتر و کامل‌تر بود، به‌خصوص:

- Dock/Undock با ذخیره وضعیت در `localStorage`
- Drawerهای دسترس‌پذیر با `aria-pressed`
- Strategy Studio متصل به API واقعی
- Backtesting با `marketCurve`، `diagnostics` و `costModel`
- دریافت تاریخچه طولانی و Pagination
- تست‌ها و Release Gateهای جدید

## مقایسه فایل‌ها

مقایسه مستقیم درخت فعال `src/` با پروژه پیوست‌شده ایجنت:

- فایل‌های Source پروژه ایجنت: 236
- فایل‌های Source نسخه نهایی: 237
- مسیرهای مشترک: 235
- فایل‌های مشترک کاملاً یکسان: 220
- فایل‌های مشترک متفاوت و بررسی‌شده: 15
- فایل‌های Source فقط در پروژه ایجنت: 1
- فایل‌های Source فقط در نسخه نهایی: 2

فایل Source منحصربه‌فرد پروژه ایجنت:

1. `src/styles/legacy-compat.css` — فایل تکراری و بدون import؛ حذف شد.

فایل‌های Source منحصربه‌فرد نسخه نهایی:

1. `src/styles/trading-drawer-docking.css` — قرارداد کامل Dock/Undock و فضای Chart.
2. `src/tests/strategyBacktestProduction.test.ts` — تست تولیدی Strategy و Backtesting.

فهرست کامل در این فایل ثبت شده است:

`QA/agent-source-comparison-v1.0.46.json`

## موارد ادغام‌شده

### 1. اصلاح فایل CSS فعال

استایل‌های پایه Dock به فایل فعال `src/index.css` منتقل و تکمیل شدند:

- `.apex-drawer-head-actions`
- `.apex-drawer-dock`
- Hover state
- حالت `aria-pressed="true"`

افزون بر تغییر ایجنت، مشکل هم‌ترازی دکمه Close در Drawerهای عمومی نیز برطرف شد؛ زیرا نسخه تولیدی `DrawerShell` دکمه‌ها را در wrapper مشترک قرار می‌دهد.

### 2. پاک‌سازی Cascade صفحه Trading

در `trading-toolbox-integration.css` و `light-theme-workspace-refinement.css` قراردادهای قدیمی زیر حذف شدند:

- ستون ثابت Order
- عرض ثابت 300px برای ستون حذف‌شده
- selector مربوط به `apex-instrument-panel` حذف‌شده

در نتیجه، لایه‌های پایه و Light Theme اکنون با `trading-drawer-docking.css` تضاد ندارند.

### 3. حفظ نسخه بهتر Production

نسخه‌های ایجنت از فایل‌های زیر جایگزین نشدند، چون نسخه فعلی کامل‌تر بود:

- `TradingToolbox.tsx`
- `ToolboxDrawers.tsx`
- `AccountViews.tsx`
- `StrategyPage.tsx`
- `BacktestingPage.tsx`
- `apexNextMarketRoutes.ts`
- `marketDataService.ts`
- `scannerPresetAdapter.ts`

## فایل حذف‌شده

`src/styles/legacy-compat.css`

این فایل در هیچ import فعالی حضور نداشت و نسخه‌ای قدیمی و تقریباً تکراری از stylesheet اصلی بود. نگهداری آن خطر ویرایش اشتباه فایل مرده را افزایش می‌داد.

## QA اضافه‌شده

دستور جدید:

```bash
npm run qa:agent-safe-merge
```

این QA شانزده قرارداد را بررسی می‌کند، از جمله:

- فعال‌بودن فایل CSS درست
- نبود فایل Legacy مرده
- تک‌ستونه بودن Trading cockpit
- حفظ پنج Drawer
- حفظ Dock persistence
- حفظ Order Ticket
- حفظ Backend واقعی Strategy و Backtesting
- هماهنگی نسخه Package و Service Worker

## نتایج اعتبارسنجی

- Agent Safe Merge: 16/16 PASS
- Trading Drawer Docking: 11/11 PASS
- Strategy/Backtest Production: 21/21 PASS
- Workspace Light Polish: 15/15 PASS
- Attached Feature Parity: 15/15 PASS
- Light Theme: 32/32 PASS
- Design Tokens: 5/5 PASS
- Reference UI: 24/24 PASS
- UI Interaction: 28/28 PASS
- Backtesting Workspace: 25/25 PASS
- Consolidation: 15/15 PASS
- System Integration: 12/12 PASS
- TypeScript/TSX/MTS syntax: 274 files, 0 errors
- CSS structure: 28 files, 0 errors
- JSON parse: 73 files, 0 errors
- Source secret gate: PASS

## محدودیت محیط

اجرای `npm ci` به‌علت خطای 404 رجیستری داخلی روی `vitest@4.1.10` متوقف شد. بنابراین Build کامل Vite و Vitest در این کانتینر دوباره اجرا نشد. این محدودیت مربوط به Registry محیط است، نه خطای سورس شناسایی‌شده.
