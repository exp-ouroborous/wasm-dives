// Sandbox service worker wiring (helpers come from sw-core.mjs, inlined by the
// build). Serves every runtime file listed in /run/manifest.json cache-first,
// verifies it against its pinned sha384, and broadcasts byte progress so the
// runner can draw a real progress bar whichever library does the fetching.

const MANIFEST_PATH = "/run/manifest.json";
const progress = new BroadcastChannel("wasm-dives-progress");
let current = null;

async function loadManifest() {
  const response = await fetch(MANIFEST_PATH, { cache: "no-cache" });
  if (!response.ok) throw new Error(`manifest: HTTP ${response.status}`);
  const text = await response.text();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const tag = [...new Uint8Array(digest)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
  current = { index: indexManifest(JSON.parse(text)), cacheName: `wasm-dives-${tag}` };
  return current;
}

async function readVerified(path, entry) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
    progress.postMessage({ type: "progress", group: entry.group, path, bytes: value.byteLength, size: entry.size });
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, ok: await verifySha384(body.buffer, entry.sha384), contentType: response.headers.get("content-type") };
}

async function serve(request) {
  const path = new URL(request.url).pathname;
  const state = current ?? (await loadManifest());
  let entry = state.index.get(path);
  if (!entry) return fetch(request);

  const cache = await caches.open(state.cacheName);
  const cached = await cache.match(path);
  if (cached) {
    progress.postMessage({ type: "progress", group: entry.group, path, bytes: entry.size, size: entry.size });
    return cached;
  }

  try {
    let result = await readVerified(path, entry);
    if (!result.ok) {
      // A new deploy can change a file's hash while this worker still holds
      // the old manifest: refresh it once before calling the file corrupt.
      const fresh = await loadManifest();
      entry = fresh.index.get(path);
      if (!entry) throw new Error("not in manifest");
      result = await readVerified(path, entry);
      if (!result.ok) throw new Error("hash mismatch");
    }
    const headers = { "content-type": result.contentType ?? "application/octet-stream" };
    const verified = new Response(result.body, { status: 200, headers });
    await (await caches.open(current.cacheName)).put(path, verified.clone());
    return verified;
  } catch {
    progress.postMessage({ type: "download-failed", group: entry.group, path });
    return new Response("download failed", { status: 502, headers: { "cache-control": "no-store" } });
  }
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const { cacheName } = await loadManifest();
      for (const name of await caches.keys()) {
        if (name.startsWith("wasm-dives-") && name !== cacheName) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/run/") || url.pathname === MANIFEST_PATH) return;
  event.respondWith(serve(event.request));
});
