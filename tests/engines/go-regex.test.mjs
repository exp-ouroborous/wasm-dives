import test from "node:test";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { yaegiCachePath } from "../../scripts/yaegi.mjs";
import { CASES, checkCase } from "./regex-contract.mjs";

// Uses the Yaegi wasm the build caches (npm run build); skips if it is absent.
const root = new URL("../..", import.meta.url).pathname;
const spec = JSON.parse(await readFile(join(root, "runtimes.json"), "utf8")).go.yaegi;
const cache = await yaegiCachePath(root, spec);
const built = await access(join(cache, "yaegi.wasm")).then(() => true, () => false);

test("go regex engine", { skip: built ? false : "run npm run build first (needs the cached Yaegi wasm)" }, async (t) => {
  await import(join(cache, "wasm_exec.js"));
  const go = new globalThis.Go();
  const { instance } = await WebAssembly.instantiate(await readFile(join(cache, "yaegi.wasm")), go.importObject);
  go.run(instance);
  const source = await readFile(join(root, "site/run/go/engines/regex.go"), "utf8");
  const loaded = await globalThis.yaegiLoad("regex", source);
  if (loaded) throw new Error(loaded);
  const analyze = async (input) => JSON.parse(await globalThis.yaegiCall("regex", JSON.stringify(input)));
  for (const testCase of CASES) await t.test(testCase.name, () => checkCase("go", testCase, analyze));
});
