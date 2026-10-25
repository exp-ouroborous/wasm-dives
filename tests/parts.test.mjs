import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fetchParts } from "../site/run/shared/parts.mjs";

const sri = (s) => `sha384-${createHash("sha384").update(s).digest("base64")}`;
const BASE = "https://wasm-dives.pages.dev/run/vendor/yaegi/0.16.1/";

function fakeFetch(files) {
  return async (url) => {
    const body = files[String(url)];
    if (body === undefined) return new Response("missing", { status: 404 });
    return new Response(typeof body === "string" ? body : JSON.stringify(body));
  };
}

const descriptor = { size: 3, sha384: sri("abc"), parts: ["yaegi.wasm.part00", "yaegi.wasm.part01"] };

test("fetchParts reassembles the parts in order and checks the whole file's hash", async () => {
  const bytes = await fetchParts(`${BASE}yaegi.wasm.json`, fakeFetch({
    [`${BASE}yaegi.wasm.json`]: descriptor,
    [`${BASE}yaegi.wasm.part00`]: "ab",
    [`${BASE}yaegi.wasm.part01`]: "c",
  }));
  assert.equal(new TextDecoder().decode(bytes), "abc");
});

test("fetchParts refuses a corrupted part", async () => {
  await assert.rejects(fetchParts(`${BASE}yaegi.wasm.json`, fakeFetch({
    [`${BASE}yaegi.wasm.json`]: descriptor,
    [`${BASE}yaegi.wasm.part00`]: "ab",
    [`${BASE}yaegi.wasm.part01`]: "X",
  })), /corrupt/);
});

test("fetchParts refuses a reassembly of the wrong size", async () => {
  await assert.rejects(fetchParts(`${BASE}yaegi.wasm.json`, fakeFetch({
    [`${BASE}yaegi.wasm.json`]: { ...descriptor, size: 4 },
    [`${BASE}yaegi.wasm.part00`]: "ab",
    [`${BASE}yaegi.wasm.part01`]: "c",
  })), /corrupt/);
});

test("fetchParts reports a part that fails to download", async () => {
  await assert.rejects(fetchParts(`${BASE}yaegi.wasm.json`, fakeFetch({
    [`${BASE}yaegi.wasm.json`]: descriptor,
    [`${BASE}yaegi.wasm.part00`]: "ab",
  })), /yaegi\.wasm\.part01.*404/);
});
