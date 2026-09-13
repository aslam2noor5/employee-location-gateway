# Employee Location Gateway

بوابة تسجيل حضور الموظفين والتحقق من موقعهم الجغرافي (GPS) قبل السماح لهم بالانتقال إلى رابط أصلي يحدده المشرف (Google Drive / Google Forms / أي رابط HTTPS).

**الفكرة:** بدلًا من إرسال الرابط الأصلي مباشرة، يُنشئ النظام رابطًا وسيطًا لكل موظف (`/check/<TOKEN>`). عند فتحه:
1. يتحقق السيرفر من الرابط والموظف.
2. يطلب صلاحية الموقع من المتصفح.
3. يحصل على GPS بدقة عالية.
4. السيرفر يحسب المسافة عن مقر العمل باستخدام معادلة Haversine.
5. يحفظ السجل في Supabase.
6. عند النجاح فقط — يتم التحويل إلى الرابط **الأصلي كما أدخله المشرف بالضبط**.

> النظام **لا** يستبدل Google Drive ولا Google Forms — إنه طبقة تحقق قبل فتح الرابط.

---

## التقنيات

- React + TypeScript + Vite
- Tailwind CSS v4
- Supabase (PostgreSQL, Auth, RLS, Edge Functions)
- Leaflet + OpenStreetMap (خرائط مجانية تمامًا — بدون أي مفتاح API)
- Browser Geolocation API
- Recharts (إحصائيات) — qrcode.react (QR)

---

## 1) إنشاء مشروع Supabase

1. أنشئ مشروعًا جديدًا على [supabase.com](https://supabase.com).
2. سجّل `Project URL` و `anon key` من **Dashboard → Settings → API**.

## 2) تشغيل قاعدة البيانات (SQL)

افتح **SQL Editor** وشغّل محتويات:
```
supabase/migrations/0001_schema.sql
```
ينشئ هذا الملف:
- `profiles` — المشرفون
- `employees` — الموظفون
- `workplaces` — المقرات
- `attendance_links` — الروابط الوسيطة (token hash فقط + نسخة مشفرة)
- `attendance_records` — سجلات الحضور
- `app_settings` — الإعدادات العامة
- RLS مفعّل على جميع الجداول، مع سياسات للمشرف فقط.

## 3) إنشاء المشرف (Admin)

> **مهم للغاية:** من **Authentication → Providers/Email → Disable "Allow new users to sign up"** حتى لا يستطيع أحد إنشاء حساب.

ثم أنشئ حساب المشرف الأول بإحدى طريقتين:

- **الطريقة الأسهل:** من **Authentication → Users → Add user** (أدخل بريدًا وكلمة مرور).
  - التريجر `on_auth_user_created` ينشئ صف `profiles` بدور `admin` تلقائيًا.
- **أو عبر SQL:**
```sql
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values (
  gen_random_uuid(),
  'admin@example.com',
  crypt('password-123', gen_salt('bf')),
  now()
);
```
سيقوم التريجر بإنشاء الـ profile تلقائيًا.

## 4) RLS

تفعيل RLS وإعداد السياسات موجود كاملًا في ملف `0001_schema.sql`.
المشرف فقط له صلاحية SELECT/INSERT/UPDATE/DELETE.
الموظف لا يحصل على أي قراءة عامة — كل العمليات تمر عبر Edge Functions بصلاحية Service Role.

## 5) إنشاء Secret للـ Edge Functions

من **Dashboard → Edge Functions → Secrets** أضف:

| Secret | الوصف |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | للوصول من السيرفر (لا يوضع أبدًا في الواجهة) |
| `LINKS_TOKEN_KEY` | مفتاح تشفير tokens — ضع قيمة عشوائية طويلة |

> `SUPABASE_SERVICE_ROLE_KEY` يُوضع **داخل بيئة الـ Edge Functions فقط** وليس في `.env` الخاص بالواجهة.

## 6) تشغيل Edge Functions

الوظائف:
| الوظيفة | الوصف |
|---|---|
| `validate-link` | تحقق خفيف من الرابط قبل طلب GPS (public) |
| `validate-attendance` | التحقق النهائي وحساب المسافة وحفظ السجل (public) |
| `create-attendance-link` | إنشاء الرابط الوسيط وتشفير الـ token (admin JWT) |
| `get-link-token` | فك تشفير الـ token للنسخ/الـ QR (admin JWT) |

تشغيلها محليًا:
```bash
supabase start
supabase functions serve
```

نشرها:
```bash
supabase login
supabase link
supabase functions deploy validate-link --no-verify-jwt
supabase functions deploy validate-attendance --no-verify-jwt
supabase functions deploy create-attendance-link
supabase functions deploy get-link-token
```

## 7) الخرائط

الخرائط داخل لوحة التحكم تُعرض عبر **Leaflet + OpenStreetMap** — مجانية بالكامل ولا تحتاج أي مفتاح API أو حساب.

- تُستخدم فقط في لوحة التحكم؛ صفحة الموظف لا تحمّل الخرائط.

## 8) التشغيل محليًا

```bash
cp .env.example .env      # ثم املأ القيم
npm install
npm run dev
```

- لوحة المشرف: `http://localhost:5173/login`
- صفحة الموظف: `http://localhost:5173/check/<TOKEN>`

## 9) Build

```bash
npm run build
npm run preview
```

## 10) Deploy

نشر على أي استضافة ثابتة (Vercel / Netlify / Cloudflare Pages):

- Build command: `npm run build`
- Output directory: `dist`
- ضع متغيرات `VITE_*` في إعدادات الاستضافة

> **ملاحظة SSG:** يمكن النشر على Vercel SPA routing بأن تُضيف rewrite لكل المسارات إلى `index.html` (لأن `/check/:token` رووت الديناميكي).

---

## المستخدمون

| الدور | الوصول |
|---|---|
| `admin` | Dashboard كامل — تسجيل دخول عبر Supabase Auth |
| `employee` | لا يوجد حساب — يدخل فقط من خلال الرابط الوسيط |

## أنواع الروابط

- **Single Use:** يُستهلك بعد أول تسجيل ناجح (`status=used`).
- **Multi Use:** يُستخدم بلا حدود، مع `max_usage_count` اختياري.
- **مدة الصلاحية:** ساعة / يوم / 3 أيام / أسبوع / بدون انتهاء.

## حالات التسجيل

`inside` · `outside` · `low_accuracy` · `location_denied` · `expired_link` · `invalid_link` · `already_used` · `disabled_link` · `error`

## مستويات التحقق

| Accuracy | المستوى |
|---|---|
| أقل من 30 متر | `high` |
| 30 – 100 متر | `medium` |
| أكبر من 100 متر | `low` |

> النظام يسجّل المؤشرات المتاحة فقط (`risk_flags`) ولا يدّعي اكتشاف Fake GPS بشكل مطلق.

## الأمان

- **RLS** على كل الجداول + سياسات admin فقط.
- **Token حصري:** يُخزَّن SHA-256 Hash للبحث، والنسخة الأصلية مشفّرة AES-256-GCM بمفتاح سري. لا يُوضع أي `?url=` في رابط الموظف.
- **منع Open Redirect:** الرابط الأصلي لا يأتي إلا من قاعدة البيانات عبر الـ token، مع تحقق دائم أنه `https:`.
- **Server-side validation:** المسافة/الداخل/الخارج تُحسب على السيرفر فقط.
- **Rate limiting** داخل الـ Edge Function، و **risk flags** للتسجيلات غير الطبيعية.
- `server_timestamp` هو وقت التسجيل الرسمي.

## إعدادات النظام (لوحة المشرف → إعدادات الحساب)

- `allow_outside_redirect` — هل يُسمح بالانتقال للرابط الأصلي لو كان الموظف خارج النطاق؟ **الافتراضي NO**.
- `global_min_accuracy` — الحد الأدنى المقبول لدقة GPS (الافتراضي 100م). يمكن تخصيصه لكل مقر أيضًا (`workplaces.min_accuracy`).

---

## هيكل المشروع

```
supabase/
  migrations/0001_schema.sql
  functions/
    _shared/cors.ts
    validate-link/index.ts
    validate-attendance/index.ts
    create-attendance-link/index.ts
    get-link-token/index.ts
  config.toml

src/
  components/        ui / dashboard / maps
  pages/
    auth/LoginPage.tsx
    check/CheckPage.tsx
    dashboard/   Home, Employees, Workplaces, Links, Attendance, Map, Settings
  layouts/DashboardLayout.tsx
  lib/  supabase / maps
  services/  employee, workplace, link, attendance, settings, validation
  hooks/     useAuth, useToast
  types/     index.ts
  utils/     formatters, validation
```