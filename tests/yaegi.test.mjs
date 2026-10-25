import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertDocker, splitFile, yaegiCacheDir } from "../scripts/yaegi.mjs";

const IMAGE = "golang:1.22.12@sha256:1cf6c45ba39db9fd6db16922041d074a63c935556a05c5ccb62d181034df7f02";
const sri = (bytes) => `sha384-${createHash("sha384").update(bytes).digest("base64")}`;

test("splitFile cuts a file into ordered parts that reassemble exactly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yaegi-split-"));
  const original = Buffer.from(Array.from({ length: 50 }, (_, i) => i));
  const file = join(dir, "yaegi.wasm");
  await writeFile(file, original);
  const result = await splitFile(file, 20);
  assert.deepEqual(result.parts, ["yaegi.wasm.part00", "yaegi.wasm.part01", "yaegi.wasm.part02"]);
  const parts = await Promise.all(result.parts.map((p) => readFile(join(dir, p))));
  assert.deepEqual(parts.map((p) => p.length), [20, 20, 10]);
  assert.deepEqual(Buffer.concat(parts), original);
  assert.equal(result.size, 50);
  assert.equal(result.sha384, sri(original));
  await assert.rejects(access(file));
});

test("yaegiCacheDir keys the cache on the Yaegi version and image digest", () => {
  assert.equal(yaegiCacheDir("/r", { version: "v0.16.1", image: IMAGE }), "/r/.cache/yaegi/v0.16.1-1cf6c45ba39d");
});

test("assertDocker names the pinned image when Docker is unavailable", () => {
  assert.throws(() => assertDocker(IMAGE, () => { throw new Error("no docker"); }), /Docker is required.*golang:1\.22\.12@sha256:/);
});

test("runtimes.json pins Yaegi, its toolchain image and a Pages-safe part size", async () => {
  const runtimes = JSON.parse(await readFile(new URL("../runtimes.json", import.meta.url), "utf8"));
  assert.equal(runtimes.go.yaegi.version, "v0.16.1");
  assert.match(runtimes.go.yaegi.image, /@sha256:[0-9a-f]{64}$/);
  assert.ok(runtimes.go.yaegi.partBytes <= 25 * 1024 * 1024);
});
