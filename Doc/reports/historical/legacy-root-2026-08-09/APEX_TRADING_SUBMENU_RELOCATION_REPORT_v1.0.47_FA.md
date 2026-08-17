# گزارش اصلاح Trading و انتقال Submenuها — APEX v1.0.47

## دامنه
این تغییر فقط روی صفحه **Trading** و ابزارهای مرتبط با آن انجام شده است. صفحات مستقل Orders، Positions و Strategies حذف نشده‌اند و همچنان برای مشاهده کامل داده‌ها در دسترس هستند.

## مشکل برطرف‌شده
در نسخه قبلی، تب‌های `Positions / Orders / Depth` داخل ستون نمودار قرار داشتند. این ساختار ارتفاع مفید نمودار را کاهش می‌داد و هنگام نمایش اطلاعات، هم نمودار و هم پنل داده فشرده می‌شدند.

## معماری جدید
ستون نمودار اکنون فقط شامل نمودار TradingView-style است. همه ابزارهای عملیاتی Trading در یک toolbox مستقل سمت راست قرار گرفته‌اند:

1. Ticket — ثبت سفارش و Risk Overview
2. Orders — سفارش‌های باز حساب
3. Positions — موقعیت‌های باز، P&L و Margin
4. Depth — Order Book و عمق بازار
5. Trades — آخرین Fillها
6. Strategy — ارتباط Strategy، Backtesting و Trading
7. Signals — امتیازها، Confluence و Execution Intelligence

## رفتار ناوبری
وقتی صفحه Trading فعال است:

- کلیک روی Orders در منوی اصلی، Drawer سفارش‌ها را باز می‌کند.
- کلیک روی Positions، Drawer موقعیت‌ها را باز می‌کند.
- کلیک روی Strategies، Drawer Strategy را باز می‌کند.
- صفحه Trading عوض نمی‌شود و نمودار unmount نمی‌شود.

در سایر صفحات، همین گزینه‌ها همچنان Workspace کامل خودشان را باز می‌کنند.

## جلوگیری از فشردگی و هم‌پوشانی نمودار
- Drawer در ستون مستقل سمت راست قرار می‌گیرد.
- هیچ Drawer با `position:absolute` روی نمودار باز نمی‌شود.
- حالت pinned و unpinned هر دو از ستون مجاور استفاده می‌کنند.
- در حالت بسته، فقط Rail کم‌عرض Toolbox باقی می‌ماند و نمودار بیشترین عرض را دریافت می‌کند.
- در حالت باز، عرض Drawer کنترل‌شده است و برای نمودار حداقل عرض دسکتاپ تعریف شده است.
- پنل داخلی قدیمی Positions / Orders / Depth از زیر نمودار حذف شده است؛ بنابراین ارتفاع نمودار افزایش یافته است.

## Pin / Unpin
- Unpinned: با Escape یا کلیک بیرون Toolbox بسته می‌شود.
- Pinned: تا زمان بستن صریح یا Unpin باز می‌ماند.
- وضعیت Pin در localStorage ذخیره می‌شود.

## فایل‌های اصلی تغییرکرده

- `src/components/workspace/AccountViews.tsx`
- `src/components/workspace/TradingToolbox.tsx`
- `src/components/workspace/ToolboxDrawers.tsx`
- `src/components/workspace/WorkspaceShell.tsx`
- `src/lib/tradingToolboxEvents.ts` — جدید
- `src/styles/trading-drawer-docking.css`
- `scripts/qa/verifyTradingSubmenuRelocation.mjs` — جدید
- `package.json`
- `package-lock.json`
- `public/sw.js`
- `README.md`
- `PROJECT_HANDOFF.md`

## اعتبارسنجی انجام‌شده

- Trading Submenu Relocation: `11/11 PASS`
- Trading Drawer Docking: `11/11 PASS`
- Workspace Light Polish: `15/15 PASS`
- Attached Feature Parity: `15/15 PASS`
- Agent Safe Merge: `16/16 PASS`
- Light Theme: `32/32 PASS`
- Reference UI: `24/24 PASS`
- UI Interaction: `28/28 PASS`
- Strategy / Backtest Production: `21/21 PASS`
- TypeScript/TSX syntax transpilation: `210 files, 0 diagnostics`
- CSS brace validation: `28 files, 0 unbalanced files`
- Source secret gate: `PASS`

## محدودیت محیط
اجرای `npm ci` در کانتینر تحویل به علت خطای Registry برای `vitest@4.1.10` متوقف شد. بنابراین Full Vite Build و Vitest پس از این تغییر در همین محیط اجرا نشدند. فایل‌های تغییرکرده با TypeScript transpilation و QAهای ساختاری بررسی شده‌اند؛ برای Release نهایی در محیط دارای Registry سالم اجرا شود:

```bash
npm ci
npm run lint
npm test
npm run build
npm run verify
npm run verify:visual
```
