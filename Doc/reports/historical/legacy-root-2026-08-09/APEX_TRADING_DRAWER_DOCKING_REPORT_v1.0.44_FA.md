# گزارش اصلاح نهایی Trading Workspace — APEX v1.0.44

## هدف
این نسخه بر اساس بازخورد تصویری کاربر، صفحه Trading را به یک ساختار **Chart-first** تبدیل می‌کند تا نمودار بیشترین فضای ممکن را داشته باشد و تمام ابزارهای جانبی از طریق Toolbox سمت راست در دسترس باشند.

## تغییرات انجام‌شده

### حذف پنل بالایی بازار
پنل بزرگ شامل موارد زیر از بالای نمودار حذف شد:

- Perpetual Futures
- نام و قیمت Symbol
- 24h High / Low
- 24h Volume
- Funding
- Open Interest

اطلاعات اصلی Symbol همچنان داخل Market Strip و خود Price Chart در دسترس است؛ بنابراین حذف این پنل باعث حذف قابلیت یا داده عملیاتی نشده و فقط فضای عمودی نمودار را آزاد کرده است.

### انتقال کامل Order به Toolbox
ستون ثابت Order و Risk Overview از Cockpit حذف شد و بدون حذف هیچ عملکردی به Drawer جدید `Order & Risk` انتقال یافت.

موارد حفظ‌شده:

- Demo / Live order state
- Buy / Long و Sell / Short
- Limit / Market / Stop
- Price و Size
- Risk، Leverage و Margin
- Preview / confirmation / validation
- Trade plan feedback
- Risk Overview
- Available balance
- Max order notional
- Open positions
- Execution state

### Drawerهای سمت راست
Toolbox اکنون پنج Drawer دارد:

1. Order
2. Depth
3. Trades
4. System
5. Signals

تمام Drawerهای قبلی حفظ شده‌اند و Order نیز به آن‌ها اضافه شده است.

### Dock / Undock
هر Drawer دو حالت دارد:

- **Undocked:** Drawer روی صفحه باز می‌شود و عرض نمودار را کاهش نمی‌دهد.
- **Docked:** Drawer به صفحه متصل می‌شود و فضای مشخصی در سمت راست رزرو می‌کند.

حالت Dock با `localStorage` ذخیره می‌شود. وضعیت پیش‌فرض Drawer بسته است؛ بنابراین هنگام بارگذاری صفحه، نمودار بیشترین عرض ممکن را دارد.

### بهبود دکمه‌های Toolbox
- دکمه‌ها بزرگ‌تر و نزدیک‌تر به مقیاس Dashboard شدند.
- Label واقعی زیر Icon قرار گرفت.
- حالت Active، Hover و Focus تقویت شد.
- اندازه و فاصله‌گذاری برای ویوپورت پایه `1368×753` تنظیم شد.

### فضای نمودار و پنل‌های پایین
- Cockpit به یک ستون اصلی تبدیل شد.
- Price Chart تمام عرض آزاد را استفاده می‌کند.
- Positions / Orders / Depth زیر نمودار حفظ شدند.
- اسکرول صفحه اصلی محدود و اسکرول به Drawer یا پنل داخلی منتقل شد.

## فایل‌های اصلی تغییرکرده

- `src/components/workspace/AccountViews.tsx`
- `src/components/workspace/TradingToolbox.tsx`
- `src/components/workspace/ToolboxDrawers.tsx`
- `src/styles/trading-drawer-docking.css`
- `src/main.tsx`
- `scripts/qa/verifyTradingDrawerDocking.mjs`
- `package.json`
- `package-lock.json`
- `public/sw.js`

## اعتبارسنجی انجام‌شده

- Trading Drawer Docking QA: `11/11 PASS`
- Workspace Light Polish: `15/15 PASS`
- Attached Feature Parity: `15/15 PASS`
- Light Theme: `32/32 PASS`
- Design Tokens: `5/5 PASS`
- UI Theme Merge: `11/11 PASS`
- Reference UI: `24/24 PASS`
- UI Interaction: `28/28 PASS`
- Backtesting Workspace: `25/25 PASS`
- Consolidation: `15/15 PASS`
- V19 Contract: `10/10 PASS`
- V20 Contract: `33/33 PASS`
- System Integration: `12/12 PASS`
- TypeScript/TSX syntax transpile: `208 files / 0 errors`
- CSS parse: `29 files / 0 errors`
- Source secret gate: `PASS`

## محدودیت محیط اجرا
اجرای `npm ci` در این محیط به‌دلیل خطای 404 رجیستری داخلی برای بسته عمومی `why-is-node-running@2.3.0` متوقف شد. این خطا مربوط به رجیستری محیط اجراست، نه تغییرات پروژه. به همین دلیل Build کامل مرورگر و Playwright در این محیط اجرا نشد.

روی سیستم دارای دسترسی عادی به npm، Gate نهایی به شکل زیر اجرا شود:

```bash
npm ci
npm run lint
npm test
npm run build
npm run qa:trading-drawer-docking
npm run verify:visual
```
