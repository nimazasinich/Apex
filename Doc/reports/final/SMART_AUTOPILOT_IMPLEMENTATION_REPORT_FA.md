# گزارش پیاده‌سازی APEX Smart Autopilot / Smart Auto‑Tuning

**وضعیت:** Source implementation + source/runtime regression verified  
**محدوده:** Backtesting Lab + Strategy Studio + Optimizer + Multi‑Strategy Research + Multi‑Agent Paper Council  
**اصل ایمنی:** Research/Paper first — Smart Autopilot مجوز ارسال سفارش به صرافی ندارد.

## هدف

یک کلید واحد Smart Autopilot اضافه/تکمیل شد تا چرخه‌های مهندسی‌شده‌ی Strategy × Market × Timeframe × Direction را به‌صورت خودکار اجرا کند، پارامترها و thresholdهای قابل‌تیون را با optimizer محدود و deterministic بهبود دهد، و فقط در صورت وجود شواهد robust نسخه‌ی جدید profile را فعال کند.

این پیاده‌سازی «مثبت‌کردن اجباری بک‌تست» یا self-modifying source code نیست. بهبود از طریق **Champion/Challenger parameter & threshold profiles** انجام می‌شود. اگر Challenger شواهد کافی نداشته باشد، هیچ promotion انجام نمی‌شود.

## معماری چرخه

1. کاربر `Start Smart Autopilot` را روشن می‌کند؛ preference در تنظیمات APEX persist می‌شود.
2. یک cycle بلافاصله و سپس هر 5 دقیقه، تا زمانی که research workspace مربوطه فعال است، اجرا می‌شود.
3. planner از strategyهای executable، بازارهای انتخاب‌شده، timeframeهای پشتیبانی‌شده و LONG/SHORT context می‌سازد.
4. cycleها با `cycleIndex` بین contextها rotate می‌شوند تا روی یک strategy یا یک timeframe قفل نشوند.
5. هر context از **active promoted profile قبلی** به‌عنوان Champion شروع می‌شود.
6. Optimizer bounded search + successive halving + refinement را اجرا می‌کند.
7. Train/validation/untouched holdout با purge/embargo از هم جدا می‌مانند.
8. Candidate باید نسبت به Champion روی holdout بهبود utility داشته باشد و P&L مثبت، PF قابل قبول، sample کافی و drawdown قابل قبول داشته باشد.
9. Candidate جداگانه تحت cost stress و neighbor stability قرار می‌گیرد.
10. سپس پنج agent مستقل promotion را بررسی می‌کنند:
    - EVIDENCE
    - HOLDOUT
    - COST_STRESS
    - STABILITY
    - OVERFIT_GUARD
11. هر VETO، promotion را متوقف می‌کند. Approval نیازمند eligibility optimizer، صفر veto، حداقل 4 SUPPORT و consensus >= 0.62 است.
12. اگر promotion تأیید شود، revision جدید immutable برای همان exact context ساخته می‌شود.
13. threshold deltaها **cumulative** هستند؛ cycle بعدی پیشرفت قبلی را reset نمی‌کند.
14. profileهای فعال دوباره از مسیر موجود `runMultiStrategyResearch()` تست می‌شوند.
15. سپس پنج-role `runMultiAgentResearchCouncil()` موجود APEX، risk/conflict/portfolio/execution evidence را برای **paper plan** ارزیابی می‌کند.
16. هیچ مرحله‌ای automatic live execution، order submission یا Risk Governor bypass را فعال نمی‌کند.

## اصلاح bypass مهم

مسیر قدیمی Strategy Studio می‌توانست `autoPromote=true` را مستقیماً به `/api/strategies/:id/optimize` بدهد. این یعنی promotion خودکار می‌توانست پنج-agent Smart Autopilot council را دور بزند.

این مسیر بسته شد:

- `/optimize` اکنون legacy `autoPromote` را فقط برای backward compatibility می‌پذیرد و آن را **نادیده می‌گیرد**.
- Manual Optimize فقط candidate تولید می‌کند؛ promotion آن دستی است.
- Strategy Studio هنگام روشن بودن Autopilot از `/api/strategies/autopilot/cycle` استفاده می‌کند.
- بنابراین تنها مسیر promotion خودکار، Smart Autopilot چندعاملی است.

## بهبود recurrent threshold learning

در `strategyOptimizationStore`، deltaهای scanner/threshold قبلاً در promotion بعدی می‌توانستند با فقط incremental delta جدید جایگزین شوند. این مسئله باعث می‌شد بخشی از یادگیری چرخه‌ی قبلی از دست برود.

اکنون:

`new effective delta = previous active delta + current incremental delta`

و optimizer هر بار از absolute winner قبلی شروع می‌کند. نتیجه: بهبود thresholdها به‌صورت revisioned و cumulative ادامه پیدا می‌کند، نه reset‌شونده.

## UI

در Configure Replay یک بخش compact اضافه/تکمیل شده است:

- OFF / ARMED / TUNING state
- Start Smart Autopilot / Stop Autopilot
- Scope: Strategy × Market × Timeframe × Direction
- Cadence: Every 5 minutes
- Promotion gate: 5-agent consensus
- Output: Research + paper plan only
- status message برای تعداد contextهای tuned/promoted و paper candidates

Robust Optimization دستی همچنان موجود است و feature loss رخ نداده است.

## API

### GET `/api/strategies/autopilot/status`
آخرین cycle و safety state را برمی‌گرداند.

### POST `/api/strategies/autopilot/cycle`
یک cycle bounded اجرا می‌کند. کنترل‌های محاسباتی محدود شده‌اند، از جمله:

- maxContexts: 1..8
- bars: 1000..5000
- optimizerConcurrency: 1..3
- coarseCandidates: 8..48
- refinementCandidates: 0..24
- portfolioRiskPct: 0.05..5

این route در compute-heavy rate limiter ثبت شده است.

## Safety invariants

در خروجی cycle صریحاً برقرارند:

- `researchOnly: true`
- `paperOnly: true`
- `executionAuthorized: false`
- `automaticOrderSubmission: false`
- `autonomousLiveExecutionEnabled: false`
- `riskGovernorBypassAllowed: false`
- `manualConfirmationRequired: true`

## فایل‌های تغییرکرده/جدید

- `package.json`
- `openapi/apex-api.v1.yaml`
- `scripts/qa/verifySmartAutopilot.mjs` — new
- `src/App.tsx`
- `src/pages/backtesting/BacktestingPage.tsx`
- `src/pages/backtesting/BacktestRunBuilder.tsx`
- `src/pages/backtesting/BacktestingPage.css`
- `src/pages/settings/SettingsPage.tsx`
- `src/pages/strategies/StrategyPage.tsx`
- `src/services/apexNextMarketRoutes.ts`
- `src/services/serverSecurity.ts`
- `src/services/smartAutopilot.ts` — new
- `src/services/strategyOptimizationStore.ts`
- `src/tests/autopilotIntegration.test.ts`
- `src/tests/smartAutopilot.test.ts` — new

## QA نهایی

- Smart Autopilot source contract: **18/18 PASS**
- Strategy Optimization integration: **26/26 PASS**
- Multi-Agent/Multi-Trading source: **20/20 PASS**
- Multi-Agent/Multi-Trading runtime: **14/14 PASS**
- Unified Safety runtime: **11/11 PASS**
- Backtesting Workspace: **25/25 PASS**
- Feature Preservation: **PASS** — تمام 13 strategy قبلی حفظ شدند
- Maximal Merge Safety: **30/30 PASS**
- Strategy Optimizer Safety runtime: **7/7 PASS**
- Syntax transpilation برای فایل‌های اصلی تغییرکرده: **PASS**
- OpenAPI YAML parse + Autopilot routes: **PASS**

Reference UI contract نیز برای Backtesting پاس شد. تنها failure موجود در verifier سراسری مربوط به layout قدیمی صفحه Positions است و به Smart Autopilot/Backtesting مربوط نیست.

## Runtime evidence کنترل‌شده

`APEX_SMART_AUTOPILOT_RUNTIME_EVIDENCE.json` نشان می‌دهد:

- planner contextها را بین cycle 0 و cycle 1 rotate می‌کند؛
- strategy blocked وارد planner نمی‌شود؛
- robust candidate با پنج SUPPORT می‌تواند approve شود؛
- weak/negative/overfit candidate توسط agents veto می‌شود.

این evidence برای صحت orchestration است و ادعای سود بازار واقعی نیست.

## محدودیت محیط فعلی

در sandbox فعلی نصب fresh dependency قبلاً به‌علت 404 registry داخلی روی dependencyهای Vite/Vitest متوقف شده است؛ بنابراین production bundle جدید را از روی source جدید نساختم و build قدیمی را هم به‌عنوان build جدید جا نزدم.

بسته‌ی SAFE MERGED تحویلی عمداً source-first است و `dist` قدیمی در آن قرار داده نشده است. در محیط دارای registry سالم:

```bash
npm ci
npm run verify
npm run build
```

سپس QA تصویری 1368×753 روی bundle تازه انجام شود.

## نکته مهندسی مهم

Smart Autopilot تضمین نمی‌کند که هر cycle نتیجه مثبت تولید کند. رفتار درست سیستم این است:

- اگر improvement robust وجود داشت → candidate می‌تواند promote شود.
- اگر evidence ضعیف/overfit/منفی بود → VETO و عدم promotion.
- اگر paper council آن context را مناسب نداند → وارد paper plan نمی‌شود.

این تفاوت بین Auto-Tuning واقعی و curve-fitting برای سبز نشان دادن خروجی است.
