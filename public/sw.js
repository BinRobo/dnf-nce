// 离线缓存：玩过的内容下次没网也能打开。
// 部署脚本会把下面的 VER 换成构建时间；换了版本，旧缓存会被清掉。
const VER = 'dev';
const CACHE = `nce-rt-${VER}`;

// 安装时先把首页和它引用的脚本 / 清单 / 图标存下来：第一次访问之后，断网也能打开页面
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE);
      const res = await fetch('./index.html', { cache: 'reload' });
      if (!res.ok) return;
      await c.put(new Request('./index.html'), res.clone());
      const html = await res.text();
      const urls = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+\.(?:js|css|webmanifest|png))"/g)].map((m) => m[1]);
      await Promise.all(urls.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)));
    } catch {
      /* 预缓存失败不影响正常使用 */
    }
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('nce-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const ok = (r) => r && r.status === 200 && r.type === 'basic';
async function put(req, res) {
  if (ok(res)) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}
function timeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
}
// 页面、课程 JSON：优先联网拿最新的，连不上（或太慢）才用缓存
async function networkFirst(req) {
  try {
    return await put(req, await Promise.race([fetch(req), timeout(5000)]));
  } catch {
    return (await caches.match(req)) ?? (req.mode === 'navigate' ? await caches.match('./index.html') : undefined) ?? Response.error();
  }
}
// 带哈希的 JS、音乐音效：缓存里有就直接用
async function cacheFirst(req) {
  return (await caches.match(req)) ?? put(req, await fetch(req));
}
// 美术图片：先给缓存，同时后台更新
async function swr(e, req) {
  const hit = await caches.match(req);
  const fresh = fetch(req).then((r) => put(req, r)).catch(() => undefined);
  if (hit) {
    e.waitUntil(fresh);
    return hit;
  }
  return (await fresh) ?? Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  // 接口、管理后台、视频和任何分段（Range）请求不缓存，直接走网络
  if (p.includes('/api/') || p.endsWith('/admin') || p.endsWith('/admin.html') || p.endsWith('.mp4') || req.headers.has('range')) return;
  if (req.mode === 'navigate' || p.endsWith('.html') || p.endsWith('.json') || p.endsWith('.webmanifest')) return e.respondWith(networkFirst(req));
  if (/\/assets\/index-[\w-]+\.js$/.test(p) || p.endsWith('.mp3')) return e.respondWith(cacheFirst(req));
  e.respondWith(swr(e, req));
});
