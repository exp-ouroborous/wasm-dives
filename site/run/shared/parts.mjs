// Reassemble a runtime that was split into parts to fit Cloudflare Pages'
// 25 MiB file limit. Each part is checked by the service worker on the way in;
// the whole file is checked again here before it is instantiated.

import { verifySha384 } from "../sw-core.mjs";

export async function fetchParts(descriptorUrl, fetcher = fetch) {
  const descriptor = await (await fetcher(descriptorUrl)).json();
  const chunks = [];
  for (const name of descriptor.parts) {
    const url = new URL(name, descriptorUrl);
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`${name} failed to download (HTTP ${response.status})`);
    chunks.push(new Uint8Array(await response.arrayBuffer()));
  }
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (bytes.byteLength !== descriptor.size || !(await verifySha384(bytes.buffer, descriptor.sha384))) {
    throw new Error("Go runtime download is corrupt");
  }
  return bytes;
}

/**
 * A fetch that serves each listed split file from its verified parts (via its
 * `<file>.json` descriptor) and passes every other request through, so a
 * library that fetches its own resources needs no changes.
 */
export function installPartsFetch(splitUrls, fetcher = globalThis.fetch) {
  const split = new Set(splitUrls.map((url) => String(url)));
  return async (input, init) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!split.has(href)) return fetcher(input, init);
    const bytes = await fetchParts(`${href}.json`, fetcher);
    const type = href.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
    return new Response(bytes, { headers: { "content-type": type } });
  };
}
