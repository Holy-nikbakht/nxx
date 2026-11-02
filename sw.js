const CACHE = 'nexet-v7';
const SPLASH_CACHE = 'nexet-splash-v1'; // کش ویدیوی اسپلش؛ خودِ صفحه مدیریتش می‌کنه
const GIF_CACHE = 'nexet-gifs-v1'; // جدا از کش اصلی؛ با تغییر نسخه‌ی اپ پاک نمی‌شه
const GIF_MAX = 250;
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './exercises-data.js',
  './icon-16.png',
  './icon-32.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './favicon.ico',
  './fonts/TitrZebr-200.woff2',
  './fonts/Kahroba-100-500.woff2',
  './fonts/Kahroba-600-800.woff2',
  './fonts/Kahroba-900.woff2',
  './fonts/vazirmatn/Vazirmatn-300.woff2',
  './fonts/vazirmatn/Vazirmatn-400.woff2',
  './fonts/vazirmatn/Vazirmatn-500.woff2',
  './fonts/vazirmatn/Vazirmatn-600.woff2',
  './fonts/vazirmatn/Vazirmatn-700.woff2',
  './fonts/vazirmatn/Vazirmatn-800.woff2',
  './fonts/vazirmatn/Vazirmatn-900.woff2'
];

const OFFLINE_HTML = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NeXet</title></head>
<body style="background:#0a0a0f;color:#f5f5f7;font-family:system-ui,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;
text-align:center;padding:20px;margin:0;">
<div>
  <h2>اتصال برقرار نشد</h2>
  <p style="color:#999;">اینترنت خود را بررسی کنید و دوباره تلاش کنید.</p>
  <button onclick="location.reload()" style="margin-top:12px;padding:12px 24px;
  border:none;border-radius:10px;background:linear-gradient(135deg,#ff6a3d,#e8431a);
  color:#fff;font-weight:700;font-size:14px;">تلاش دوباره</button>
</div>
</body></html>`;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // تک‌تک اضافه می‌کنیم تا نبودِ یک فایل باعث شکست کل پیش‌کش نشه
      Promise.allSettled(PRECACHE.map(u => c.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== GIF_CACHE && k !== SPLASH_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return /\.(woff2?|ttf|otf|png|jpe?g|gif|webp|svg|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  const url = new URL(req.url);
  // ویدیوی اسپلش رو سرویس‌ورکر دست نمی‌زنه (کش جدا و دستی داره)؛ وگرنه دوبار دانلود/ذخیره می‌شد
  if (url.pathname.endsWith('/splash.mp4')) return;
  // گیف‌ها/تصویرهای بیرونی: بار اول از شبکه، از دفعه‌ی بعد فوری از حافظه‌ی گوشی (بدون مصرف اینترنت)
  if (url.origin !== self.location.origin) {
    if (req.destination === 'image' && url.hostname !== 'trustseal.enamad.ir') {
      e.respondWith(
        caches.open(GIF_CACHE).then(async gc => {
          const hit = await gc.match(req);
          if (hit) return hit;
          try {
            const res = await fetch(req);
            if (res && (res.ok || res.type === 'opaque')) {
              gc.put(req, res.clone()).then(async () => {
                const keys = await gc.keys();
                if (keys.length > GIF_MAX) await Promise.all(keys.slice(0, keys.length - GIF_MAX).map(k => gc.delete(k)));
              }).catch(() => {});
            }
            return res;
          } catch (err) {
            return new Response('', { status: 504, statusText: 'Network error' });
          }
        })
      );
    }
    // بقیه‌ی درخواست‌های بیرونی (Firebase، API لایسنس، هوش مصنوعی) دست‌نخورده می‌مونن
    return;
  }

  // فونت‌ها و تصویرها: اول کش (فوری)، اگه نبود از شبکه و ذخیره
  if (isStaticAsset(url)) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() => new Response('', { status: 504, statusText: 'Network error' }));
      })
    );
    return;
  }

  // خودِ صفحه (index.html): اول شبکه با مهلت ۳ ثانیه؛ اگه جواب نداد از کش. این‌طوری آپدیت‌ها همون
  // دفعه‌ی اول دیده می‌شن (قبلاً نسخه‌ی قدیمی یک بار دیگه نشون داده می‌شد) ولی با نت کند/قطع هم اپ باز می‌شه.
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      new Promise(resolve => {
        let settled = false;
        const fromCache = () => caches.match(req, { ignoreSearch: true }).then(c => c || caches.match('./index.html'));
        const timer = setTimeout(() => {
          fromCache().then(c => { if (c && !settled) { settled = true; resolve(c); } });
        }, 3000);
        fetch(req).then(res => {
          clearTimeout(timer);
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          if (!settled) { settled = true; resolve(res); }
        }).catch(() => {
          clearTimeout(timer);
          fromCache().then(c => {
            if (settled) return;
            settled = true;
            resolve(c || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
          });
        });
      })
    );
    return;
  }

  // صفحه، اسکریپت‌ها و مانیفست: نسخه‌ی کش‌شده فوری نشون داده می‌شه و هم‌زمان در پس‌زمینه
  // به‌روز می‌شه (دفعه‌ی بعد نسخه‌ی تازه رو می‌بینی) — دیگه منتظر شبکه نمی‌مونه
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      });
      if (cached) {
        network.catch(() => {}); // به‌روزرسانی پس‌زمینه؛ خطاش مهم نیست
        return cached;
      }
      return network.catch(() => {
        if (req.mode === 'navigate') {
          return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        return new Response('', { status: 504, statusText: 'Network error' });
      });
    })
  );
});
