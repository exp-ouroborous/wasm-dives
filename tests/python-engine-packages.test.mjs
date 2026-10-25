import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ENGINE_PACKAGES, enginePackages } from "../site/run/python/engine-packages.mjs";

const runtimes = JSON.parse(await readFile(new URL("../runtimes.json", import.meta.url), "utf8"));

test("every wheel an engine needs is one the build vendors (pinned in runtimes.json)", () => {
  const vendored = new Set(runtimes.python.wheels.files.map((w) => w.file));
  for (const [name, { wheels }] of Object.entries(ENGINE_PACKAGES)) {
    for (const wheel of wheels) assert.ok(vendored.has(wheel), `${name}: ${wheel} is not vendored`);
  }
});

test("enginePackages resolves wheels against the vendored wheel directory, then lock names", () => {
  const base = new URL("https://wasm-dives.pages.dev/run/vendor/python-wheels/");
  assert.deepEqual(enginePackages("markdown", base), [
    "https://wasm-dives.pages.dev/run/vendor/python-wheels/markdown-3.11-py3-none-any.whl",
    "bleach",
  ]);
  assert.deepEqual(enginePackages("json", base), []);
});
