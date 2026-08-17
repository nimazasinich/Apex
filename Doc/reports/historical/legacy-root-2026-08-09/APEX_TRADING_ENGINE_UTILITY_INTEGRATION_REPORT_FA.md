# گزارش ادغام ابزارهای مفید APEX Trading Engine

## خلاصه

نسخه قدیمی‌تر `APEX-Trading-Engine.zip` با پروژه فعلی مقایسه شد. هیچ Strategy Engine قدیمی جایگزین موتورهای موجود نشد. فقط ابزارهایی که قابلیت جدید، تست‌پذیر و هم‌راستا با معماری فعلی داشتند، به‌صورت محدود و ایمن ادغام شدند.

نسخه خروجی پروژه:

```text
1.0.35
```

اصل ایمنی اجرای این مرحله:

```text
هیچ ابزار جدیدی مستقیماً مسیر سفارش، محاسبات مالی یا Scanner Gateهای اصلی را تغییر نمی‌دهد.
```

## قابلیت‌های اضافه‌شده

### ۱. آمار آنلاین و هموارسازی بازار

فایل:

```text
src/services/onlineStatistics.ts
```

شامل:

- `EWMATracker`
- `WelfordNormalizer`
- `OITrendTracker`
- `SymbolStatisticsRegistry`
- singletonهای `marketStatistics` و `openInterestTrends`

ویژگی‌ها:

- محاسبه پایدار میانگین، واریانس، انحراف معیار و Z-score بدون نگهداری کل تاریخچه؛
- EWMA برای OBI، Volume Delta و ATR؛
- تشخیص `EXPANDING`، `CONTRACTING` و `NEUTRAL` برای Open Interest؛
- محدودیت LRU برای جلوگیری از رشد نامحدود حافظه؛
- اعتبارسنجی ورودی‌های غیرمتناهی؛
- استقلال کامل از مسیر سفارش.

ادغام فعال فعلی فقط OBI هموارشده را به Context چرخه‌عمر سیگنال می‌دهد. Scanner Gate، امتیازدهی اصلی و Execution از مقدار خام/منطق فعلی خود استفاده می‌کنند.

### ۲. کنترلر سریع تطبیقی ۱ و ۵ دقیقه‌ای

فایل:

```text
src/services/fastAdaptiveShadowController.ts
```

خروجی کنترلر:

- خلاصه ۱ دقیقه‌ای و ۵ دقیقه‌ای؛
- نرخ پذیرش، نرخ رد Gate، نرخ رد Squeeze و SMC؛
- Win Rate و PnL معاملات resolve‌شده؛
- پیشنهاد محدود برای Thresholdها و وزن‌ها؛
- ثبت دلایل هر تغییر؛
- نرمال‌سازی وزن‌ها به مجموع ۱؛
- سقف تغییر در هر چرخه؛
- `shadowOnly: true` و عدم اعمال خودکار.

Endpoint جدید:

```text
GET /api/operations/adaptive-thresholds/fast-shadow?minSamples=24
```

پاسخ Endpoint صریحاً شامل موارد زیر است:

```text
applied: false
```

بنابراین هیچ Config فعال، Scanner یا Order Path تغییر داده نمی‌شود.

### ۳. KuCoin Public WebSocket با Sequence Validation

فایل:

```text
src/services/kucoinStreaming.ts
```

شامل:

- `KuCoinL2SequenceBook`
- `KuCoinPublicStreamClient`
- `SequenceValidatedL2Stream`
- `parseStreamingFlag`

رفتارهای ایمنی:

- قابلیت به‌صورت پیش‌فرض خاموش است؛
- اتصال فقط با Opt-in صریح فعال می‌شود؛
- هر Order Book ابتدا با REST Seed ساخته می‌شود؛
- Delta تکراری نادیده گرفته می‌شود؛
- Sequence Gap باعث `degraded` و درخواست REST Reseed می‌شود؛
- Crossed Book رد می‌شود و Snapshot قبلی حفظ می‌گردد؛
- داده Streaming وابستگی اجرای سفارش ندارد؛
- reconnect با backoff انجام می‌شود؛
- subscriptionها بین مصرف‌کنندگان به اشتراک گذاشته می‌شوند.

متغیرهای محیطی:

```text
APEX_KUCOIN_STREAMING_ENABLED=false
VITE_APEX_KUCOIN_STREAMING_ENABLED=false
```

Endpoint وضعیت:

```text
GET /api/operations/market-streaming
```

### ۴. Postman Collection امن

فایل:

```text
tools/postman/APEX-Unified-Terminal.postman_collection.json
```

شامل درخواست‌های آماده برای:

- System Health و Operations؛
- Fast Adaptive Shadow؛
- Market Streaming Status؛
- KuCoin Public Data؛
- Binance Public Sentiment؛
- Supplemental News، Sentiment و On-chain؛
- Telegram Status و Test؛
- Account/Decision endpoints امن.

ملاحظات:

- Token واقعی در Collection وجود ندارد؛
- متغیر `operatorToken` خالی است؛
- درخواست ثبت سفارش واقعی داخل Collection قرار نگرفته است.

### ۵. Hardening تست‌های Core

فایل‌های تست اضافه‌شده:

```text
src/tests/onlineStatistics.test.ts
src/tests/fastAdaptiveShadowController.test.ts
src/tests/kucoinStreaming.test.ts
src/tests/tradingEngineCoreHardening.test.ts
```

پوشش‌های جدید:

- Welford، EWMA، OI Trend و LRU؛
- عدم Mutation کنترلر Shadow؛
- محدودیت تغییر Thresholdها؛
- نرمال‌بودن مجموع وزن‌ها؛
- Sequence Apply، Duplicate، Range و Gap؛
- عدم اتصال WebSocket در حالت Disabled؛
- OBI، ATR، Micro-price و Platt Calibration؛
- عدم ساخت Zone جعلی؛
- بودجه Batch و Rotation اسکنر؛
- تقارن جهت LONG/SHORT در SMC؛
- Scope صحیح Last-Known-Good؛
- محدودیت و رشد Exponential Backoff.

Runner بدون Vitest:

```text
scripts/qa/verifyTradingEngineUtilities.mts
```

اسکریپت package:

```text
npm run qa:trading-engine-utilities
```

این Runner در زنجیره `npm run verify` نیز اضافه شده است.

## فایل‌های تغییرکرده

```text
.env.example
package.json
package-lock.json
server.ts
src/services/apexNextMarketRoutes.ts
PROJECT_HANDOFF.md
```

## فایل‌های اضافه‌شده

```text
APEX_TRADING_ENGINE_UTILITY_INTEGRATION_REPORT_FA.md
scripts/qa/verifyTradingEngineUtilities.mts
src/services/fastAdaptiveShadowController.ts
src/services/kucoinStreaming.ts
src/services/onlineStatistics.ts
src/tests/fastAdaptiveShadowController.test.ts
src/tests/kucoinStreaming.test.ts
src/tests/onlineStatistics.test.ts
src/tests/tradingEngineCoreHardening.test.ts
tools/postman/APEX-Unified-Terminal.postman_collection.json
vendor/yallist-3.1.1.tgz
```

فایل `vendor/yallist-3.1.1.tgz` حفظ شد، چون `package-lock.json` پروژه به همین وابستگی محلی اشاره دارد.

## مواردی که عمداً ادغام نشدند

موارد زیر از آرشیو قدیمی جایگزین نسخه فعلی نشدند:

- Strategy Engineهای قدیمی؛
- `App.tsx` و Shell قدیمی؛
- تم Obsidian Crimson؛
- `marketData.ts` یکپارچه و وابسته به Polling؛
- Componentهای قدیمی HUD و Signal Sheet؛
- فایل‌های `.env` و Configهای Runtime؛
- `dist`، Logها و اسکرین‌شات‌های قدیمی؛
- Binaryهای بدون Source.

## اعتبارسنجی انجام‌شده

### موفق

```text
git diff --check
```

نتیجه: PASS

```text
tsc -p /tmp/apex-tools-tsconfig.json
```

نتیجه: PASS برای سه Service جدید با Strict Type Checking.

```text
scripts/qa/verifyTradingEngineUtilities.mts
```

نتیجه:

```json
{
  "ok": true,
  "checks": {
    "ewma": true,
    "welford": true,
    "l2SequenceValidation": true,
    "streamingFlag": true,
    "fastAdaptiveShadow": true,
    "mathEngineHardening": true,
    "scannerRotationBudget": true,
    "smcDirectionalSymmetry": true,
    "providerLkgAndBackoff": true
  }
}
```

Syntax transpile برای ۱۰ فایل TypeScript/MTS تغییرکرده: PASS.

Postman JSON parse: PASS.

```text
node scripts/gates/checkNoSecretsInRelease.mjs --source-only
```

نتیجه: PASS.

### محدودیت محیط

اجرای کامل موارد زیر در این Container ممکن نشد:

```text
npm ci
npx tsc --noEmit
npm test
npm run build
```

علت، خطای رجیستری داخلی است:

```text
404 Not Found: why-is-node-running-2.3.0.tgz
```

این خطا در مرحله دریافت Dependency رخ می‌دهد و نتیجه شکست Compile یا Test کد نیست.

## گیت نهایی پیشنهادی روی سیستم اصلی

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

سپس WebSocket فقط ابتدا در Demo/Shadow Mode فعال شود و رفتار Gap/Reseed در شرایط قطع شبکه و reconnect بررسی گردد.
