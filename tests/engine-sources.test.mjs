import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishEngineSources } from "../scripts/engines.mjs";

test("publishEngineSources copies each language's engines beside the card assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "engines-"));
  await mkdir(join(root, "site/run/go/engines"), { recursive: true });
  await mkdir(join(root, "site/run/python/engines"), { recursive: true });
  await writeFile(join(root, "site/run/go/engines/regex.go"), "package main");
  await writeFile(join(root, "site/run/python/engines/regex.py"), "def handle(x): ...");
  const published = await publishEngineSources(join(root, "site"), join(root, "dist"));
  assert.deepEqual(published.sort(), ["cards/wasm-assets/engines/go/regex.go", "cards/wasm-assets/engines/python/regex.py"]);
  assert.equal(await readFile(join(root, "dist/cards/wasm-assets/engines/go/regex.go"), "utf8"), "package main");
});
