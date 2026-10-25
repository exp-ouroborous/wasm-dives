import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vendorRuntime } from "../scripts/vendor.mjs";

async function fakePackage() {
  const root = await mkdtemp(join(tmpdir(), "wasm-dives-pkg-"));
  const pkg = join(root, "node_modules/@demo/rt");
  await mkdir(join(pkg, "de"), { recursive: true });
  await mkdir(join(pkg, "_framework"), { recursive: true });
  await writeFile(join(pkg, "de/x.resources.dll"), "de");
  await writeFile(join(pkg, "_framework/dotnet.wasm"), "wasm");
  await writeFile(join(pkg, "index.js"), "export {};");
  await writeFile(join(pkg, "WasmCompiler.js"), 'import "https://unpkg.com/x";');
  await writeFile(join(pkg, "package.json"), JSON.stringify({ version: "1.0.0" }));
  return { nodeModules: join(root, "node_modules"), dist: join(root, "dist") };
}

const spec = { package: "@demo/rt", version: "1.0.0", vendorDir: "run/vendor/rt/1.0.0", exclude: ["de", "WasmCompiler.js"] };

test("vendorRuntime copies the package except excluded entries", async () => {
  const { nodeModules, dist } = await fakePackage();
  const copied = await vendorRuntime(nodeModules, dist, spec);
  assert.deepEqual(copied.sort(), ["_framework/dotnet.wasm", "index.js", "package.json"]);
  await access(join(dist, "run/vendor/rt/1.0.0/_framework/dotnet.wasm"));
  await assert.rejects(access(join(dist, "run/vendor/rt/1.0.0/de/x.resources.dll")));
  await assert.rejects(access(join(dist, "run/vendor/rt/1.0.0/WasmCompiler.js")));
});

test("vendorRuntime refuses a package whose installed version differs from the pin", async () => {
  const { nodeModules, dist } = await fakePackage();
  await writeFile(join(nodeModules, "@demo/rt/package.json"), JSON.stringify({ version: "1.0.1" }));
  await assert.rejects(vendorRuntime(nodeModules, dist, spec), /1\.0\.1.*1\.0\.0|pinned/);
});
