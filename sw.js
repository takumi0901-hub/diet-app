// サービスワーカー（オフラインでも画面を開けるようにする）
// 画面のファイルを更新したら、CACHE_NAME のバージョンを上げる

const CACHE_NAME = "diet-app-v1";

// 最初にキャッシュする、同じオリジンの画面のファイル（sw.js からの相対パス）
const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "logic.js",
  "sheets.js",
  "manifest.json",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

// インストール：画面のファイルをキャッシュする
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting())
  );
});

// 有効化：古いバージョンのキャッシュを削除する
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("diet-app-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 通信：ネットワーク優先、失敗したらキャッシュ
// 同じオリジンの GET だけを扱う。スプレッドシート連携（script.google.com など）は
// 別のオリジンなので、ここで return して respondWith を呼ばない（横取りもキャッシュもしない）
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // 成功（ok）した、同じオリジンの応答だけをキャッシュする
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          // 画面を開く通信なら、キャッシュした index.html を返す
          if (request.mode === "navigate") return caches.match("index.html");
          return Response.error();
        })
      )
  );
});
