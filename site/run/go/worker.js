// The Go runtime: Yaegi compiled to WebAssembly (runtimes/go), in this
// dedicated worker so the runner can terminate it. The wasm arrives in parts
// (Cloudflare Pages' 25 MiB file limit) and is reassembled and re-verified
// before it is instantiated.
import { serveRuntime } from "../shared/runtime-worker.mjs";
import { fetchParts } from "../shared/parts.mjs";
import { toRunResult } from "./yaegi-result.mjs";

const VENDOR = new URL("../vendor/yaegi/0.16.1/", import.meta.url);

serveRuntime({
  async boot() {
    await import(new URL("wasm_exec.js", VENDOR).href); // defines globalThis.Go
    const bytes = await fetchParts(new URL("yaegi.wasm.json", VENDOR));
    const go = new globalThis.Go();
    const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
    go.run(instance); // main registers yaegiRun, then blocks forever on select {}
    if (typeof globalThis.yaegiRun !== "function") throw new Error("Yaegi did not start");
    return { runtime: globalThis.yaegiRun, version: `${globalThis.yaegiGoVersion} · Yaegi v0.16.1` };
  },
  async run(yaegiRun, source) {
    return toRunResult(await yaegiRun(source));
  },
});
