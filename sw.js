/* 大学数学题库 · Service Worker
 * 策略：
 *  - 页面导航：网络优先（保证拿到最新页面），断网回缓存
 *  - 静态资源（切片/JS/CSS/图片）：缓存优先 + 后台静默刷新（SWR）
 *    —— 服务器偶发抽风时直接用缓存，不再卡住；改版靠 CACHE 版本号强制刷新
 *  - 跨域请求（云端 API、CDN）：直接放行，绝不拦截
 */
const CACHE = 'mathbank-v36';
const SHELL = ['./', './app.css', './meta.js', './fav.html', './ch.html', './qmap.js', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.allSettled(SHELL.map((u) => c.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 云端 API / CDN 不碰
  if (url.pathname.endsWith("version.json")) { e.respondWith(fetch(req)); return; } // 版本号永远走网络
  // 核心代码/数据永远绕过一切缓存直连源站——即使页面引用的版本串被外部改旧，
  // 用户端拿到的仍是最新代码（防多会话/外部进程覆盖版本串导致的更新失效）
  const LIVE = ["app.js", "meta.js", "app.css"];   // qmap/questions 体积大且随数据版本走固定 URL，勿强拉
  if (LIVE.some((v) => url.pathname.endsWith(v))) {
    e.respondWith(fetch(url.pathname + "?live=" + Date.now(), { cache: "no-store" }));
    return;
  }

  if (req.mode === 'navigate') {
    // 关键一招：给页面入口 URL 附加当前 SW 版本号再请求。
    // CDN 对固定 URL 的缓存会挡住更新，URL 一变必然穿透回源拿最新页面；
    // SW 脚本本身永远取最新，所以升版本 = 全站页面强制更新。
    const bust = url.pathname + "?mbv=" + CACHE + (url.search ? "&" + url.search.slice(1) : "");
    e.respondWith(
      fetch(new Request(bust, { headers: req.headers }))
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match('./'))
        )
    );
    return;
  }

  // 静态资源：缓存优先（命中立即返回，不等网络），后台拉最新版替换
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
