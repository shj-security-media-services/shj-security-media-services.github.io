# الإعلام الأمني · موقع التطبيق

[![التوفر](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/uptime.yml/badge.svg)](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/uptime.yml)
[![نسبة التوفر](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fshj-security-media-services%2Fshj-security-media-services.github.io%2Fstatus%2Fuptime%2Fbadge.json)](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/uptime.yml)
[![Lighthouse](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/lighthouse.yml)
[![الفحص البصري](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/visual.yml/badge.svg)](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/visual.yml)
[![الروابط](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/links.yml/badge.svg)](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/links.yml)
[![CodeQL](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/codeql.yml/badge.svg)](https://github.com/shj-security-media-services/shj-security-media-services.github.io/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/shj-security-media-services/shj-security-media-services.github.io/badge)](https://scorecard.dev/viewer/?uri=github.com/shj-security-media-services/shj-security-media-services.github.io)

هذا المستودع يُنشر كما هو على https://shj-security-media-services.github.io (GitHub Pages من فرع `main`).
ملفات الموقع تُبنى وتُنشر من المستودع الخاص للنظام؛ **لا تعدّل ملفات الموقع هنا يدوياً**. مجلد `.github/` وحده للفحوص التالية.

> **قاعدة أمان:** لا يتصل أي فحص بخادم تسجيل الدخول أبداً (الدخول يرسل رموز واتساب لأشخاص حقيقيين). فحوص المتصفح تُوقف كل طلب خارج الموقع،
> و Lighthouse يحجب الخادم، وفحص التوفر يقرأ الملفات الثابتة فقط. لا يكتب أي فحص في خانات الدخول ولا يضغط أزراره.

## الفحوص

| الفحص | متى | ماذا يفعل | عند المشكلة |
|---|---|---|---|
| [التوفر · Uptime](workflows/uptime.yml) | كل 5 دقائق | يفتح `/` و `/get/` و `manifest.webmanifest` و `sw.js` و `version.json` و ملف APK (أكبر من 500 KB) و `assetlinks.json` (يحتوي `ae.shj.securitymedia`)، ويحفظ السجل في فرع `status` لحساب نسبة التوفر | بلاغ واحد «🔴 الموقع متوقف» (وسم `عطل`)، ثم «✅ عاد الموقع» مع مدة التوقف ويُغلق تلقائياً |
| [Lighthouse](workflows/lighthouse.yml) | بعد كل نشر، ويدوياً | ينتظر حتى يظهر النشر الجديد ثم يقيس `/` و `/get/` على الجوال: الأداء، سهولة الوصول، أفضل الممارسات، SEO | تنبيه إذا قلّت سهولة الوصول عن 90 أو الأداء عن 70 (لا يفشل). SEO منخفض عمداً لأن الصفحات `noindex` |
| [الفحص البصري · Visual](workflows/visual.yml) | بعد كل نشر، ويدوياً | صور `/` و `/get/` على آيفون (390×844) وأندرويد (360×780)، فاتح وداكن، عربي وإنجليزي (16 صورة)، تُقارن بصور المرجع في فرع `visual-baseline`، مع فحص axe-core لسهولة الوصول | بلاغ «🎨 تغيّر في شكل الصفحات» بصور قبل/بعد/الفرق ويفشل الفحص؛ نتائج axe تنبيه فقط |
| [الروابط · Links](workflows/links.yml) | كل سبت | lychee على الصفحات المنشورة وملفات HTML | بلاغ واحد «🔗 روابط مكسورة» (وسم `روابط`) يُغلق عند الإصلاح |
| [Scorecard](workflows/scorecard.yml) | كل اثنين وبعد كل دفع | OpenSSF Scorecard لممارسات أمان المستودع؛ النتيجة في الشارة أعلاه وفي Security → Code scanning | — |
| [CodeQL](workflows/codeql.yml) | بعد كل دفع وكل أربعاء | فحص أمني لشيفرة JavaScript وملفات GitHub Actions | التنبيهات في Security → Code scanning |
| [ميزانية الحجم · Size budget](workflows/size.yml) | بعد كل دفع | حجم JavaScript و CSS للتطبيق (من `release.json`) وصفحة `get/` مقارنة بالدفعة السابقة | تنبيه إذا زاد الحجم أكثر من 10% |
| [التقرير الأسبوعي](workflows/weekly-report.yml) | كل أحد 05:00 UTC (09:00 الإمارات) | بلاغ «📋 التقرير الأسبوعي» بنسبة التوفر والأعطال ونتائج كل الفحوص وتغييرات الأسبوع | يُغلق تقرير الأسبوع السابق |

نتائج الفحوص الأخيرة محفوظة في فرع [`status`](https://github.com/shj-security-media-services/shj-security-media-services.github.io/tree/status) (ملفات JSON)، وصور المرجع في فرع [`visual-baseline`](https://github.com/shj-security-media-services/shj-security-media-services.github.io/tree/visual-baseline). الفرعان لا يُنشران على الموقع.

## اعتماد تغيّر مقصود في شكل الصفحات

عندما يتغيّر شكل صفحة عن قصد (تصميم جديد مثلاً) يفشل «الفحص البصري» ويفتح بلاغ «🎨 تغيّر في شكل الصفحات» بالصور:

1. افتح البلاغ وراجع صور **قبل** و **بعد** و **الفرق** (الأحمر = ما تغيّر).
2. إن كان التغيير مقصوداً: **Actions** ← **Visual** ← **Run workflow** ← فعّل **accept** ← **Run workflow**.
   أو من الطرفية: `gh workflow run visual.yml -R shj-security-media-services/shj-security-media-services.github.io -f accept=true`
3. تصبح الصور الحالية هي المرجع الجديد ويُغلق البلاغ تلقائياً.

إن لم يكن التغيير مقصوداً فأصلح الصفحة وانشرها؛ سيُغلق البلاغ تلقائياً عندما تعود الصفحات مطابقة للمرجع.

## تشغيل فحص يدوياً

**Actions** ← اختر الفحص ← **Run workflow**، أو: `gh workflow run <file>.yml -R shj-security-media-services/shj-security-media-services.github.io`

## الأمان

للإبلاغ عن ثغرة بشكل خاص راجع [SECURITY.md](SECURITY.md).
