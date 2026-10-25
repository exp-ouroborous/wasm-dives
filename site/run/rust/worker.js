// The Rust runtime (experimental): Miri, Rust's MIR interpreter, compiled to
// WASI, interprets the program with browser_wasi_shim, in this dedicated
// worker so Stop can end it. The files are served gzipped and inflated here;
// the service worker has already checked each against the manifest.
import { serveRuntime } from "../shared/runtime-worker.mjs";
import { MIRI_FILE, RUST_VERSION, runMiri, sysrootTree } from "./miri.mjs";
import { toRunResult } from "./rust-result.mjs";

const VENDOR = "/run/vendor/rubri/00de75bc/";
const SHIM = new URL("../vendor/browser_wasi_shim/0.4.2/dist/index.js", import.meta.url);

async function inflate(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return new Response(response.body.pipeThrough(new DecompressionStream("gzip")));
}

serveRuntime({
  async boot() {
    const manifest = await (await fetch("/run/manifest.json", { cache: "no-cache" })).json();
    const paths = manifest.groups.rust.files.map((f) => f.path).filter((p) => p.startsWith(VENDOR) && p.endsWith(".gz"));
    const shim = await import(SHIM.href);
    const files = new Map();
    let miri = null;
    await Promise.all(
      paths.map(async (path) => {
        const name = path.slice(VENDOR.length).replace(/\.gz$/, "");
        const inflated = await inflate(path);
        if (name === MIRI_FILE) {
          miri = await WebAssembly.compile(await inflated.arrayBuffer());
        } else {
          files.set(name, new Uint8Array(await inflated.arrayBuffer()));
        }
      }),
    );
    if (!miri) throw new Error("Miri is missing from the manifest");
    return { runtime: { shim, miri, sysroot: sysrootTree(shim, files) }, version: RUST_VERSION };
  },
  async run({ shim, miri, sysroot }, source) {
    return toRunResult(await runMiri(shim, miri, sysroot, source));
  },
});
