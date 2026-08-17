# گزارش ادغام امن رابط کاربری APEX — v1.0.40

## 1. دامنه بررسی

پروژه پیوست‌شده زیر به‌صورت فایل‌به‌فایل با نسخه فعلی APEX مقایسه شد:

```text
ورودی پیوست: APEX-complete-operations-observability-v1.0.39-v20bext.zip
مبنای فعلی: APEX-complete-ui-token-fix-v1.0.38
خروجی ادغام‌شده: APEX-complete-ui-safe-merge-v1.0.40
مقیاس پایه رابط: 1368×753
```

پوشه‌های تولیدشده، وابستگی‌ها، گزارش‌های قدیمی و خروجی‌های حجیم در مقایسه محتوایی نادیده گرفته شدند. نتیجه مقایسه نشان داد که پروژه پیوست‌شده از نظر بسیاری از تعاملات صفحه‌ای قدیمی‌تر از نسخه فعلی است، اما چند بهبود مفید در قرارداد تم و کامل‌بودن Help/Header دارد.

## 2. نتیجه مقایسه معماری و رابط

نسخه فعلی APEX در این بخش‌ها پیشرفته‌تر بود و حفظ شد:

- Global feedback و toastهای دسترس‌پذیر
- تغییر واقعی و ماندگار Light/Dark
- جست‌وجوی سراسری با کنترل صفحه‌کلید
- انتخاب و مرتب‌سازی ردیف‌های Positions و Orders
- انتقال امن Symbol/Draft به Trading
- ویرایش و Reset در Alerts
- تشخیص تغییرات ذخیره‌نشده در Settings
- بازخورد Export/Copy/Refresh در History و Help
- QAهای Design Tokens و UI Interaction

بنابراین هیچ‌کدام از فایل‌های TSX صفحه‌های پیوست‌شده به‌صورت کامل جایگزین نشدند. این تصمیم از بازگشت قابلیت‌ها و از بین رفتن تعاملات فعلی جلوگیری می‌کند.

## 3. قابلیت‌های مثبت استخراج‌شده و ادغام‌شده

### 3.1 قرارداد سراسری تم تاریک

فایل پیوست‌شده دارای overrideهای منسجم‌تر برای متغیرهای APEX در Dark mode بود. این بخش به‌صورت انتخابی داخل فایل زیر ادغام شد:

```text
src/styles/tokens.css
```

توکن‌های Light موجود و اصلاحات v1.0.38 حفظ شدند و فقط مجموعه Dark زیر تکمیل شد:

- Canvas و Surfaceها
- Border و Divider
- متن اصلی و متن کم‌اهمیت
- سطوح سبز semantic
- رنگ‌های Red، Orange، Blue، Violet و Teal
- Focus ring و Shadowها

نتیجه این است که صفحات دارای کارت، جدول، badge و active state در Dark mode دیگر به سطح سفید یا رنگ ارثی نامعتبر برنمی‌گردند.

### 3.2 سطوح Theme-aware برای صفحات اصلی

بخش‌های قابل استفاده از فایل‌های زیر منتقل شدند:

```text
src/styles/reference-ui.css
src/pages/help/HelpPage.css
src/pages/watchlist/WatchlistPage.css
```

سطوح hardcoded روشن با متغیرهای زیر جایگزین شدند:

```css
var(--v20-surface)
var(--v20-surface-soft)
var(--apex-surface)
var(--apex-surface-soft)
```

این تغییر به‌خصوص برای Orders، Positions، Settings، Help و Watchlist در forced Dark mode اهمیت دارد.

### 3.3 میانبر صریح Settings در Header

یک دکمه مستقل Settings به Header افزوده شد:

```text
src/components/workspace/WorkspaceShell.tsx
```

این دکمه:

- دارای `aria-label="Open settings"` است؛
- از همان navigation داخلی برنامه استفاده می‌کند؛
- مسیر جدید یا state جداگانه ایجاد نمی‌کند؛
- در کنار Theme، Alerts، Journal و System Health قرار می‌گیرد؛
- رفتار Avatar موجود را حذف نمی‌کند.

### 3.4 کامل‌شدن کارت‌های آموزشی Help

نسخه پیوست‌شده برای Tutorialها تصویر واقعی‌تری داشت، اما implementation فعال پروژه فقط کارت متنی نشان می‌داد. چهار thumbnail از مرجع UI استخراج و به asset محلی تبدیل شد:

```text
public/tutorial-thumbnails/getting-started.png
public/tutorial-thumbnails/first-trade.png
public/tutorial-thumbnails/portfolio.png
public/tutorial-thumbnails/security.png
```

در `HelpPage.tsx` هر Tutorial به asset محلی متصل شد. استفاده از asset داخلی باعث می‌شود:

- درخواست خارجی و CORS/ORB ایجاد نشود؛
- UI آفلاین و PWA پایدار بماند؛
- کارت‌ها در Light/Dark یکسان بارگذاری شوند؛
- مرجع بصری صفحه Help کامل‌تر شود.

هم‌زمان یک باگ واقعی CSS اصلاح شد: stylesheet قبلی selector مربوط به `article` داشت، در حالی که Tutorialها در DOM به‌صورت `button.apex-v3-tutorial-card` رندر می‌شدند. اکنون hover، focus، border و thumbnail روی عنصر واقعی اعمال می‌شوند.

### 3.5 QA جلوگیری از Regression

فایل جدید زیر اضافه شد:

```text
scripts/qa/verifyUiThemeMerge.mjs
```

و script زیر به `package.json` افزوده شد:

```bash
npm run qa:ui-theme-merge
```

این QA موارد زیر را بررسی می‌کند:

- کامل‌بودن Dark APEX token contract
- وجود V20 dark surface contract
- theme-aware بودن کارت‌ها
- وجود Settings shortcut
- وجود هر چهار thumbnail
- صحیح‌بودن selector کارت Tutorial
- عدم بازگشت stylesheet مرده `v3-workspace.css`
- حفظ interaction feedback layer

این بررسی داخل زنجیره اصلی `npm run verify` نیز قرار گرفته است.

### 3.6 Runtime QA توسعه‌یافته

فایل زیر توسعه یافت:

```text
scripts/qa/verifyWorkspaceRuntime.mts
```

Runtime QA در صورت فراهم‌بودن dependencies، صفحات زیر را در Dark mode باز می‌کند و computed background آن‌ها را بررسی می‌کند:

```text
Help
Watchlist
Orders
Positions
Settings
```

همچنین render شدن thumbnail کارت Help در 1368×753 بررسی و screenshot ثبت می‌شود.

## 4. مواردی که عمداً ادغام نشدند

### TSX صفحه‌های قدیمی

نسخه‌های پیوست‌شده صفحات زیر interactionهای کمتری از پروژه فعلی داشتند و جایگزین نشدند:

```text
WorkspaceShell
Alerts
Help
History
Orders
Positions
Settings
Watchlist
```

فقط تغییرات کوچک و مستقل روی نسخه فعلی اعمال شد.

### stylesheet مرده

فایل زیر در پروژه پیوست‌شده وجود داشت، اما import فعال نداشت و قبلاً از نسخه فعلی حذف شده بود:

```text
src/styles/v3-workspace.css
```

این فایل دوباره وارد نشد.

### Watchlist + Custom tab

مرجع UI یک تب Custom نشان می‌داد، اما contract، persistence و رفتار دقیق آن در سورس پیوست‌شده کامل و قابل اتکا نبود. برای جلوگیری از ایجاد قابلیت نمایشی یا داده ساختگی، این بخش ادغام نشد.

### بازنویسی کامل CSS/Architecture

هیچ Route، API payload، localStorage key، محاسبه مالی، Strategy Engine یا جریان سفارش تغییر نکرد.

## 5. فایل‌های جدید

```text
public/tutorial-thumbnails/getting-started.png
public/tutorial-thumbnails/first-trade.png
public/tutorial-thumbnails/portfolio.png
public/tutorial-thumbnails/security.png
scripts/qa/verifyUiThemeMerge.mjs
APEX_SAFE_UI_MERGE_REPORT_v1.0.40.md
QA/ui-safe-merge-v1.0.40.json
```

## 6. فایل‌های تغییرکرده

```text
package.json
package-lock.json
scripts/qa/verifyWorkspaceRuntime.mts
src/components/workspace/WorkspaceShell.tsx
src/pages/help/HelpPage.css
src/pages/help/HelpPage.tsx
src/pages/watchlist/WatchlistPage.css
src/styles/reference-ui.css
src/styles/tokens.css
PROJECT_HANDOFF.md
```

فایل‌های QA JSON تولیدشده توسط اجرای مجدد بررسی‌ها نیز به‌روزرسانی شدند.

## 7. اعتبارسنجی انجام‌شده

```text
Design Token Contract: PASS — 5/5
UI Theme Merge Contract: PASS — 11/11
Reference UI QA: PASS — 24/24
UI Interaction QA: PASS — 28/28
Strategy Library QA: PASS
Strategy Engines QA: PASS
Strategy Integration QA: PASS
Adaptive Governor QA: PASS
System Integration QA: PASS — 12/12
TypeScript isolated syntax transpile for changed TS/TSX/MTS: PASS
CSS brace/structure validation for changed stylesheets: PASS
Source-only release secret gate: PASS
```

## 8. محدودیت اعتبارسنجی محیط

`npm install`/`npm ci` در این محیط به‌دلیل خطای 404 رجیستری برای بسته زیر کامل نشد:

```text
why-is-node-running@2.3.0
```

به همین دلیل نتیجه کامل dependency-backed برای موارد زیر ادعا نمی‌شود:

```text
npx tsc --noEmit
npm test
npm run build
Playwright runtime screenshots
```

کدهای تغییرکرده از نظر syntax، قراردادهای static UI، CSS structure، secret gate و سلامت آرشیو بررسی شده‌اند. Release Gate نهایی روی سیستم دارای registry سالم باید با دستورات زیر اجرا شود:

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

## 9. جمع‌بندی

ادغام به‌صورت additive و محدود انجام شد: قرارداد Dark mode کامل‌تر شد، سطوح صفحات با تم هماهنگ شدند، Header دسترسی واضح‌تری گرفت، Help از نظر بصری و تعاملی کامل‌تر شد و QAهای جلوگیری از regression اضافه شدند. قابلیت‌های پیشرفته‌تر نسخه فعلی حفظ شدند و هیچ صفحه، feature، داده یا محاسبه‌ای با نسخه قدیمی‌تر جایگزین نشد.
