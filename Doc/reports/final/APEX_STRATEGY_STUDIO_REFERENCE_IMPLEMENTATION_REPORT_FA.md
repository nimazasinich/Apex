# گزارش پیاده‌سازی APEX Strategy Studio Reference

تاریخ QA: 2026-08-09
پایه‌ی ادغام: `APEX_v1.0.56_SMART_AUTOPILOT_SAFE_MERGED`
خروجی: `APEX_v1.0.56_STRATEGY_STUDIO_REFERENCE_SAFE_MERGED`

## هدف

Strategy Studio موجود به‌صورت in-place refactor شد تا معماری اطلاعاتی، هندسه‌ی سه‌ستونه، زبان بصری سبز/تیل، Workflow، Library، Configuration، Dynamic Fusion و Evidence Rail با تصویر و Production Specification جدید هم‌راستا شود. هیچ backend mock یا نتیجه‌ی جعلی برای شبیه‌سازی تصویر اضافه نشده است.

## فایل‌های تغییرکرده

- `src/pages/strategies/StrategyPage.tsx`
- `src/pages/strategies/StrategyLibraryRail.tsx`
- `src/pages/strategies/StrategyModelWorkspace.tsx`
- `src/pages/strategies/StrategyEvidenceRail.tsx`
- `package.json`

## فایل‌های جدید

- `src/pages/strategies/StrategyWorkflowStepper.tsx`
- `src/pages/strategies/StrategyStudioReference.css`
- `public/assets/strategies/strategy-hero-isometric.svg`
- `public/assets/strategies/strategy-card-fusion.svg`
- `public/assets/strategies/strategy-card-trend.svg`
- `public/assets/strategies/strategy-card-funding.svg`
- `public/assets/strategies/strategy-card-breakout.svg`
- `public/assets/strategies/strategy-card-volatility.svg`
- `scripts/qa/verifyStrategyStudioReference.mjs`
- `QA/strategy-studio-reference-contract.json`
- `Doc/references/strategy-studio-reference-1448x1086.png`
- `Doc/references/strategy-studio-reference-implementation-spec.md`

## تغییرات Frontend

- Strategy Studio به سه سطح مستقل `Strategy Library / Center Studio / Evidence Rail` تبدیل شد و در 1368×753 نیز با ستون‌های کنترل‌شده و internal scrolling طراحی شده است.
- Workflow واقعی `Discover → Configure → Validate → Send to Backtesting` اضافه شد. state آن از validation/evidence واقعی مشتق می‌شود و decorative completion ندارد.
- Strategy Library تمام search/filter/bookmark/selection قبلی را نگه می‌دارد؛ filter control واقعی باز/بسته می‌شود و artworkها کاملاً local SVG هستند.
- Identity/metadata header با اطلاعات واقعی Strategy ساخته شد. Confidence در صورت نبود داده `—` باقی می‌ماند.
- پارامترهای عددی به range slider + numeric input همگام تبدیل شدند و همان handler قبلی `onParameterChange` را استفاده می‌کنند؛ keyboard/min/max/step حفظ شده است.
- Dynamic Fusion فقط از `fusionSnapshot` واقعی استفاده می‌کند. Auto-refresh واقعی 30 ثانیه‌ای به همان refresh handler موجود وصل است و manual refresh نیز حفظ شده است.
- Model Explanation به کارت‌های فشرده‌ی reference نزدیک شد، ولی ruleهای کامل قبلی داخل expandable detail حفظ شده‌اند.
- Evidence Rail بازطراحی شد و Validation، Smart Optimization، Liquidity Hunter Shadow، Optimization Profile/Rollback، threshold governance، replay datasets، manual testnet confirmation و provenance/metrics واقعی همچنان قابل دسترسی‌اند.
- `Evidence Ready` فقط وقتی نمایش داده می‌شود که evidence واقعاً bound و وضعیت display برابر `Verified` باشد؛ snapshot کامل ولی degraded به صورت `Evidence Bound · Review Required` نمایش داده می‌شود.
- Registry external-action تزئینی حذف شد چون action واقعی متناظر وجود نداشت.
- primary actions از gradient سبز/تیل reference استفاده می‌کنند؛ focus/disabled/loading و accessibility semantics حفظ شده‌اند.

## Backend

هیچ فایل backend، API route، service، model یا قرارداد business logic تغییر نکرد. Strategy Studio جدید روی state/handler/APIهای موجود سوار شده است.

## حفظ Smart Autopilot / Multi-Agent / Multi-Trading

Smart Autopilot و robust optimizer نسخه‌ی قبلی دست‌نخورده باقی مانده‌اند. Strategy Studio همچنان Smart Optimization را به مسیر واقعی optimizer وصل می‌کند و Autopilot همچنان از five-agent promotion council و multi-strategy paper research استفاده می‌کند. Liquidity Hunter حالت research/shadow دارد و manual testnet confirmation حفظ شده است. هیچ مسیر autonomous live execution به این refactor اضافه نشده است.

## نتایج Regression QA

- Strategy Studio Reference Contract: **25/25 PASS**
- Feature Preservation: **PASS — 13 strategy قبلی حفظ شدند**
- Smart Autopilot: **18/18 PASS**
- Multi-Agent/Multi-Trading Source: **20/20 PASS**
- Multi-Agent/Paper Runtime: **14/14 PASS**
- Unified Safety Runtime: **11/11 PASS**
- Strategy Optimization Integration: **26/26 PASS**
- Strategy Optimization Safety Runtime: **7/7 PASS**
- Core10 Dynamic Fusion: **17/17 PASS**
- Research Workspace Layout: **15/15 PASS**
- Maximal Merge Safety: **30/30 PASS**

## محدودیت محیط اجرا

`npm ci` در sandbox حاضر به‌دلیل 404 رجیستری داخلی روی dependencyهای پروژه (از جمله Vitest/Vite) کامل نمی‌شود. در نتیجه fresh production bundle و browser screenshot از همین source جدید در این محیط قابل تولید نبود و این گزارش آن را به‌عنوان PASS ادعا نمی‌کند. source/runtime contractهای dependency-independent اجرا شده‌اند. برای acceptance نهایی pixel QA باید در محیط دارای registry سالم `npm ci`, سپس `npm run verify`/build و launch انجام و صفحه‌ی واقعی در 1368×753 با reference مقایسه شود.

یک failure قدیمی و خارج از scope در verifier عمومی Reference UI مربوط به صفحه‌ی Positions (`positions screenshot layout`) نیز از قبل وجود دارد؛ این refactor Strategy Studio آن صفحه را تغییر نداده است.

## نتیجه

پیاده‌سازی Strategy Studio به‌صورت safe in-place انجام شده است: ظاهر و information hierarchy به reference نزدیک شده، stateهای نمایشی از داده‌ی واقعی مشتق می‌شوند، قابلیت‌های قبلی حذف نشده‌اند، backend دست نخورده و Smart Autopilot/Multi-Agent/Multi-Trading و safety constraints حفظ و regression-test شده‌اند.
