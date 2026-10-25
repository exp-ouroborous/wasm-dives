import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const headers = await readFile(new URL("../site/_headers", import.meta.url), "utf8");

test("runner pages may only be framed by the site's own origins", () => {
  assert.match(
    headers,
    /\/run\/\*\n {2}Content-Security-Policy: frame-ancestors https:\/\/wordsfortheunwise\.com https:\/\/www\.wordsfortheunwise\.com https:\/\/wasm-dives\.pages\.dev http:\/\/localhost:8788\n/,
  );
});

test("vendored runtimes are immutable and the service worker is always revalidated", () => {
  assert.match(headers, /\/run\/vendor\/\*\n {2}Cache-Control: public, max-age=31536000, immutable\n/);
  assert.match(headers, /\/run\/sw\.js\n {2}Cache-Control: no-cache\n/);
});

test("no cross-origin isolation headers in phase 1", () => {
  assert.doesNotMatch(headers, /Cross-Origin-Embedder-Policy|Cross-Origin-Opener-Policy/);
});
