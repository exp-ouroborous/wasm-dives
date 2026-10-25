import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchWheel } from "../scripts/wheels.mjs";

const bytes = new TextEncoder().encode("a wheel");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const wheel = { file: "demo-1.0-py3-none-any.whl", url: "https://files.example/demo.whl", sha256 };

test("fetchWheel downloads once, verifies the pinned SHA-256 and caches", async () => {
  const cache = await mkdtemp(join(tmpdir(), "wheels-"));
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(bytes); };
  const path = await fetchWheel(wheel, cache, fetchImpl);
  assert.deepEqual(new Uint8Array(await readFile(path)), bytes);
  await fetchWheel(wheel, cache, fetchImpl);
  assert.equal(calls, 1, "second call uses the cache");
});

test("fetchWheel refuses bytes that do not match the pin, downloaded or cached", async () => {
  const cache = await mkdtemp(join(tmpdir(), "wheels-"));
  await assert.rejects(fetchWheel(wheel, cache, async () => new Response("tampered")), /SHA-256 mismatch/);
  await writeFile(join(cache, wheel.file), "tampered");
  await assert.rejects(fetchWheel(wheel, cache, async () => new Response("tampered")), /SHA-256 mismatch/);
});

test("fetchWheel fails on an HTTP error", async () => {
  const cache = await mkdtemp(join(tmpdir(), "wheels-"));
  await assert.rejects(fetchWheel(wheel, cache, async () => new Response("", { status: 404 })), /HTTP 404/);
});
