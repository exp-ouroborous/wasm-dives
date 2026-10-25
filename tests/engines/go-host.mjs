// Loads the Yaegi wasm the build caches (npm run build) and a Go engine source,
// returning analyze(input) -> output, or null when the wasm is not built yet.
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { yaegiCachePath } from "../../scripts/yaegi.mjs";

const root = new URL("../..", import.meta.url).pathname;
let booted = null;

export async function goEngine(name) {
  const spec = JSON.parse(await readFile(join(root, "runtimes.json"), "utf8")).go.yaegi;
  const cache = await yaegiCachePath(root, spec);
  const built = await access(join(cache, "yaegi.wasm")).then(() => true, () => false);
  if (!built) return null;
  booted ??= (async () => {
    await import(join(cache, "wasm_exec.js"));
    const go = new globalThis.Go();
    const { instance } = await WebAssembly.instantiate(await readFile(join(cache, "yaegi.wasm")), go.importObject);
    go.run(instance);
  })();
  await booted;
  const failure = await globalThis.yaegiLoad(name, await readFile(join(root, `site/run/go/engines/${name}.go`), "utf8"));
  if (failure) throw new Error(failure);
  return async (input) => JSON.parse(await globalThis.yaegiCall(name, JSON.stringify(input)));
}
