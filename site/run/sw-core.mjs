// Pure helpers for the sandbox service worker. The build inlines this file
// into dist/run/sw.js (a classic worker), so it must not import anything.

/** path -> { size, sha384, group } for every runtime file in the manifest. */
export function indexManifest(manifest) {
  const index = new Map();
  for (const [group, { files }] of Object.entries(manifest.groups)) {
    for (const { path, size, sha384 } of files) index.set(path, { size, sha384, group });
  }
  return index;
}

function base64(buffer) {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** True when bytes hash to the SRI-style "sha384-<base64>" value. */
export async function verifySha384(bytes, expected) {
  const digest = await crypto.subtle.digest("SHA-384", bytes);
  return `sha384-${base64(digest)}` === expected;
}

/** Byte progress for one runtime boot, against the manifest's unpacked total. */
export class ProgressTracker {
  constructor(totalBytes) {
    this.total = totalBytes;
    this.loaded = 0;
  }

  add(bytes) {
    this.loaded += bytes;
    return { loaded: this.loaded, total: this.total };
  }

  fail(path) {
    return { failed: path };
  }
}
