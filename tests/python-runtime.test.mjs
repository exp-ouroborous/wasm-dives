import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { vendoredGroup } from "../scripts/manifest.mjs";

const runtimes = JSON.parse(await readFile(new URL("../runtimes.json", import.meta.url), "utf8"));

test("Pyodide is pinned and only its core files are vendored", () => {
  assert.equal(runtimes.python.package, "pyodide");
  assert.equal(runtimes.python.version, "314.0.7");
  assert.deepEqual(runtimes.python.include.sort(), ["pyodide-lock.json", "pyodide.asm.mjs", "pyodide.asm.wasm", "pyodide.mjs", "python_stdlib.zip"]);
  assert.equal(runtimes.python.notice, "pyodide.md");
});

test("a plain vendored runtime's manifest group covers its folder and its own runner files", () => {
  assert.deepEqual(vendoredGroup({ vendorDir: "run/vendor/x/1", files: ["run/x/worker.js"] }), ["run/vendor/x/1", "run/x/worker.js"]);
  assert.deepEqual(vendoredGroup({ vendorDir: "run/vendor/x/1" }), ["run/vendor/x/1"]);
});
