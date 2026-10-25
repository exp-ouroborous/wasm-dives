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
