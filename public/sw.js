const CACHE_NAME = "smartsari-shell-v5";
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/logo-mark.png?v=2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>SmartSari — Sedang Offline</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0E0F12;color:#F4F4F5;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
    .card{max-width:380px;background:#151619;border:1px solid #2C2E35;border-radius:16px;padding:28px}
    .badge{display:inline-block;background:#DB2777;color:#fff;font-weight:700;font-size:12px;padding:4px 12px;border-radius:999px;margin-bottom:14px}
    h1{font-size:18px;margin:0 0 8px}
    p{font-size:13px;color:#A1A1AA;line-height:1.5;margin:0 0 18px}
    button{background:#DB2777;color:#fff;border:0;border-radius:999px;padding:10px 20px;font-weight:600;font-size:13px;cursor:pointer}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">SmartSari</div>
    <h1>Koneksi Terputus</h1>
    <p>Periksa koneksi internet Anda lalu muat ulang halaman untuk melanjutkan riset.</p>
    <button onclick="location.reload()">Muat Ulang</button>
  </div>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((r) => r || caches.match("/"))
            .then(
              (r) =>
                r ||
                new Response(OFFLINE_HTML, {
                  status: 503,
                  headers: { "Content-Type": "text/html; charset=utf-8" },
                })
            )
        )
    );
    return;
  }

  // Stale-while-revalidate for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
