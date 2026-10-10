# Mattergram — Telegram UI Client for Mattermost

یک کلاینت مدرن و کامل برای **Mattermost** که با **Vue 3**، **TypeScript**، **Pinia** و **Tailwind CSS** ساخته شده است و رابط کاربری و تجربه کاربری (UI/UX) آن دقیقاً مطابق با **Telegram Web** طراحی شده است.

---

## 🌟 ویژگی‌ها (Features)

- 🎨 **طراحی کاملاً شبیه به تلگرام (Telegram Web UI/UX)**:
  - حباب‌های پیام ورودی و خروجی با استایل و دم تلگرام (`Tails`)
  - تصویر زمینه اختصاصی چت تلگرام (`Telegram Wallpaper Doodle Pattern`)
  - نمایش زمان پیام، وضعیت تیک‌های ارسال و خوانده شدن (`✓` و `✓✓`)
  - تفکیک‌کننده‌های تاریخ وسط صفحه (Date Separators)
  - نوار ابزار هاور تلگرام روی پیام‌ها برای واکنش سریع (Quick Reactions) و منوی عملیات (Reply, Edit, Delete, Copy)
  - نوار پاسخ پیام (Reply Quote Preview) و ویرایش پیام (Edit Bar)
  - پشتیبانی کامل از متن‌های فارسی و دوجهته (`dir="auto"`)
  - قالب‌های **دارک مود** و **لایت مود** تلگرام با تغییر خودکار و دستی
  - افکت‌های صوتی پیام تلگرام (صدای ارسال و دریافت پیام با Web Audio API)

- 🔗 **پیکربندی داینامیک آدرس سرور (Configurable Base URL)**:
  - امکان وارد کردن Base URL سرور Mattermost در صفحه ورود و بخش تنظیمات
  - دکمه بررسی و تست اتصال زنده سرور (Test Connection)
  - دور زدن کامل محدودیت‌های CORS بدون نیاز به تنظیمات خاص روی سرور از طریق پروکسی معکوس هوشمند داخلی Vite و Node

- ⚡️ **ارتباط زنده با وب‌سوکت (Real-Time WebSocket Sync)**:
  - دریافت لحظه‌ای پیام‌های جدید (`posted`)
  - نمایش تایپ کردن کاربران در هدر چت و لیست چت‌ها (`user is typing...`)
  - تغییرات وضعیت آنلاین/آفلاین/Away کاربران (`status_change`)
  - واکنش‌ها و ایموجی‌ها به صورت زنده (`reaction_added`, `reaction_removed`)
  - ویرایش و حذف لحظه‌ای پیام‌ها (`post_edited`, `post_deleted`)

- 📁 **مدیریت فایل‌ها و رسانه‌ها (Files & Attachments)**:
  - آپلود مستقیم فایل‌ها و اسناد به Mattermost
  - پیش‌نمایش تصاویر با لایت‌باکس بزرگنمایی
  - کارت نمایش فایل‌ها (PDF، داکیومنت‌ها) با نمایش حجم فایل و دکمه دانلود

- 👥 **انواع چت و کانال**:
  - کانال‌های عمومی (Public Channels)
  - کانال‌های خصوصی (Private Groups)
  - پیام‌های خصوصی (Direct Messages)
  - **Saved Messages** (پیام‌های ذخیره شده تلگرام با آیکون بوکمارک اختصاصی)
  - تب‌های پوشه‌ای تلگرام: All Chats, Channels, Direct Messages, Unread
  - منوی کشویی سمت چپ (Drawer Menu) و پنل سمت راست اطلاعات چت و اعضا (Chat Info Drawer)

---

## ⚙️ پیکربندی متغیرهای محیطی (.env)

قبل از اجرای پروژه، یک فایل `.env` بر اساس `.env.example` بسازید و آدرس سرور Mattermost خود را وارد کنید:

```bash
cp .env.example .env
```

محتوای فایل `.env`:
```env
MATTERMOST_BASE_URL=https://your-mattermost-server.com
```

---

## 🚀 نحوه راه‌اندازی و اجرا

### ۱. اجرای حالت توسعه (Development Mode)
```bash
npm install
npm run dev
```
برنامه روی آدرس `http://localhost:5173` باز می‌شود.

### ۲. ساخت و اجرای نسخه نهایی (Production Build)
```bash
npm run build
npm start
```

### ۳. اجرا با داکر (Docker & Docker Compose)

#### روش ۱: اجرای مستقیم با دستور Docker
ابتدا ایمیج داکر پروژه را بیلد کنید:
```bash
docker build -t mattergram .
```

سپس کانتینر را اجرا کنید و آدرس سرور Mattermost خود را تعیین کنید:
```bash
docker run -d \
  --name mattergram \
  -p 5173:5173 \
  -e MATTERMOST_BASE_URL=https://your-mattermost-server.com \
  mattergram
```

#### روش ۲: اجرا با Docker Compose
پس از تنظیم آدرس سرور در فایل `.env`:
```bash
docker compose up -d
```
پروژه روی آدرس `http://localhost:5173` در دسترس خواهد بود.

---

## 🔄 یکپارچه‌سازی مداوم (GitHub Actions CI)

یک پایپ‌لاین خودکار GitHub Actions در مسیر `.github/workflows/build.yml` تعبیه شده است که با هر ارسال کد (`push`) یا درخواست ادغام (`pull_request`) روی شاخه `master`:
1. وابستگی‌های پروژه را نصب و اعتبارسنجی می‌کند (`npm ci`).
2. تایپ‌ها و فایل‌های باندل فرانت‌اند را بیلد می‌کند (`npm run build`).
3. ایمیج داکر را به صورت بهینه و چندمرحله‌ای (Multi-stage) می‌سازد تا از صحت بیلد داکر در محیط CI مطمئن شود.

