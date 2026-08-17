# گزارش ادغام و اصلاح APEX UI — نسخه V13 Polished

## مبنای ادغام

- پایه اصلی: `APEX-ui-merged-v11-smooth`
- بخش‌های ادغام‌شده از نسخه Premium: کارت‌های متریک، ساختار نمایش مقدار/واحد/بازه و Gaugeهای اصلاح‌شده
- الزامات تکمیلی: `Doc/V13_INPUT_POLISH_REQUIREMENTS.md`

## تغییرات اعمال‌شده

### 1. Drawerهای سمت راست

- `.apex-drawer-body` از حالت برش اجباری به ناحیه اسکرول واقعی تبدیل شد.
- اسکرول عمودی نرم، Scrollbar باریک، `overscroll-behavior: contain` و `scrollbar-gutter: stable` اضافه شد.
- محدودیت داخلی Watchlist نیز اصلاح شد؛ ردیف‌های `.apex-toolbox-watchlist-rows` دیگر با `overflow:hidden` پنهان نمی‌شوند.
- Watchlist همچنان حداکثر ۲۰ نماد را نشان می‌دهد و در ارتفاع‌های پایین قابل اسکرول است.
- در تست ارتفاع محتوای ۶۰۰ پیکسل، Drawer دارای ۱۰۶ پیکسل محدوده اسکرول بود و تا انتها اسکرول شد.

### 2. Order Ticket

- ارتفاع و ریتم عمودی ورودی‌های عددی تثبیت شد.
- Stepperها دقیقاً در مرکز عمودی قرار گرفتند.
- واحدهای `USDT`، `contracts` و `x` بدون Wrap یا هم‌پوشانی نمایش داده می‌شوند.
- گروه Allocation، گزینه‌های درصدی، Accordion پیشرفته و Badgeهای DEMO/LIVE/LOCKED هم‌تراز شدند.
- جریان واقعی Service در حالت Demo Mock با توابع اصلی پروژه آزمایش شد:
  - `previewOrder(draft)`
  - دریافت Confirmation Phrase
  - `submitLiveOrder(preview.id, confirmation)`
- هر دو درخواست Preview و Submit با Headerهای Mutation صحیح اجرا شدند.
- اتصال واقعی KuCoin و ارسال سفارش با پول واقعی، به‌دلیل نبود Credential در محیط آزمایش، اجرا نشده است.

### 3. کارت‌های متریک و Gaugeها

- کارت‌های Premium نسخه قبلی با پایه Smooth ادغام شدند.
- مقدار، واحد و Range به ساختارهای مستقل تبدیل شدند تا متن از کارت بیرون نزند.
- Ellipsis، `min-width:0` و Container Query برای مقادیر طولانی اعمال شد.
- Labelها خواناتر شدند و Detailها Dot رنگی هماهنگ دارند.
- Gaugeها دارای Halo، اندازه‌های Compact/Large و محدوده امن داخلی برای متن هستند.
- در تست‌های 1280×720 و 1672×941 هیچ Overflow در Metric Copy یا Gauge Copy ثبت نشد.

### 4. هماهنگی بین صفحات

برای جلوگیری از برنده‌شدن تصادفی Overrideهای قدیمی، یک لایه Canonical نهایی برای این خانواده‌ها ایجاد شد:

- `.apex-panel`
- `.apex-table`
- `.apex-watchlist-row`
- `.apex-metric-card`
- `.apex-colored-gauge`
- `.apex-order-ticket`

Overrideهای وابسته به Context و Breakpoint حفظ شدند، اما Radius، Border، Shadow، ارتفاع ردیف و Typography از Tokenهای مشترک پیروی می‌کنند.

### 5. خوانایی متن

- تمام `font-size`های ثابت کمتر از ۷ پیکسل در `src/index.css` حذف یا به حد خواناتر ارتقا داده شدند.
- بخش‌های Risk، Tier، Market Facts، Watchlist، Depth، Portfolio Foot، Summary Metrics و Ticket Microcopy اصلاح شدند.
- بررسی نهایی: تعداد `font-size` ثابت کمتر از ۷ پیکسل = صفر.

### 6. آیکون رمزارزها

- Bundle محلی از ۱۱ نماد به ۲۵ نماد افزایش یافت.
- نمادهای محلی: AAVE, ADA, ALGO, ATOM, AVAX, BCH, BNB, BSV, BTC, DASH, DOGE, DOT, EOS, ETC, ETH, LINK, LTC, MATIC, SOL, TRX, UNI, XLM, XMR, XRP, XTZ.
- تمام فایل‌ها PNG واقعی 32×32 و داخل `public/crypto-icons` هستند.
- `CoinIcon.tsx` دارای Cache مشترک Module-level برای Source موفق و Sourceهای شکست‌خورده است.
- Instanceهای بعدی یک Coin مستقیماً از Source موفق قبلی استفاده می‌کنند.
- Timeout هر Source برابر ۲.۲ ثانیه است و پس از پایان زنجیره، Letter Badge قطعی نمایش داده می‌شود.

### 7. Reduced Motion

- Override سراسری و تهاجمی `.001ms` حذف شد.
- حرکت‌های Translate/Scale، Shimmer و Accordion برای کاربران Reduced Motion غیرفعال می‌شوند.
- Feedbackهای کوتاه رنگ و Opacity با مدت ۸۰ میلی‌ثانیه حفظ شدند.
- در پروژه Price-flash Keyframe مستقلی یافت نشد که با این تغییر از بین برود.

### 8. Dependency Vendor

- فایل گمشده `vendor/yallist-3.1.1.tgz` به پروژه اضافه شد.
- `package-lock.json` به فایل محلی و Integrity واقعی آن متصل شد.
- نصب Dependency از مرحله Yallist عبور کرد، اما Registry داخلی محیط آزمایش برای `why-is-node-running@2.3.0` پاسخ 404 داد؛ بنابراین اجرای کامل `npm run lint`، `npm run build` و `npm test` در این Sandbox ممکن نشد.

## نتایج QA

| بررسی | نتیجه |
|---|---|
| Transpile نحوی ۹۱ فایل TS/TSX | بدون خطا |
| Parse کامل CSS | ۱۸۷۵ Rule، بدون خطا |
| توازن Braceهای CSS | ۲۲۱۱ باز / ۲۲۱۱ بسته |
| Overflow افقی صفحات | صفر در 1280×720 و 1672×941 |
| Overflow Metric/Gauge | صفر |
| Drawer با ۲۰ ردیف | Scroll واقعی و قابل استفاده |
| Order input/stepper/suffix | هم‌تراز و بدون Wrap |
| Demo preview→confirm→submit service flow | موفق |
| Live KuCoin execution | اجرا نشده؛ Credential موجود نبود |
| Full npm build/test | متوقف بر اثر 404 Registry برای dependency خارجی |

فایل‌های گزارش خام داخل پوشه `QA/` قرار دارند.
