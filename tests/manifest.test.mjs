import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, assertPagesFileLimits } from "../scripts/manifest.mjs";

const ABC_SHA384 = "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "wasm-dives-"));
  await mkdir(join(dir, "run/vendor/x/1.0.0/sub"), { recursive: true });
  await writeFile(join(dir, "run/vendor/x/1.0.0/a.wasm"), "abc");
  await writeFile(join(dir, "run/vendor/x/1.0.0/sub/b.js"), "export {};\n");
  return dir;
}

test("buildManifest lists every file under a group's prefixes with URL paths", async () => {
  const dir = await fixture();
  const manifest = await buildManifest(dir, { demo: ["run/vendor/x/1.0.0"] });
  assert.equal(manifest.version, 1);
  assert.deepEqual(
    manifest.groups.demo.files.map((f) => f.path),
    ["/run/vendor/x/1.0.0/a.wasm", "/run/vendor/x/1.0.0/sub/b.js"],
  );
});

test("buildManifest records size and SRI-style sha384", async () => {
  const dir = await fixture();
  const manifest = await buildManifest(dir, { demo: ["run/vendor/x/1.0.0"] });
  const a = manifest.groups.demo.files[0];
  assert.equal(a.size, 3);
  assert.equal(a.sha384, ABC_SHA384);
  assert.equal(manifest.groups.demo.totalBytes, manifest.groups.demo.files.reduce((n, f) => n + f.size, 0));
});

test("assertPagesFileLimits names the first oversized file", async () => {
  const dir = await fixture();
  await assert.rejects(assertPagesFileLimits(dir, 2), /a\.wasm/);
});

test("buildManifest accepts a single file as a group entry", async () => {
  const dir = await fixture();
  const manifest = await buildManifest(dir, { demo: ["run/vendor/x/1.0.0/sub/b.js"] });
  assert.deepEqual(manifest.groups.demo.files.map((f) => f.path), ["/run/vendor/x/1.0.0/sub/b.js"]);
});
