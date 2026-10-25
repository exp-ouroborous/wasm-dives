// Compiles a C/C++ engine source with YoWASP clang (the compiler the browser
// card uses) and runs it under the same WASI shim and argv mapping.
import { readFile } from "node:fs/promises";
import { runClang } from "@yowasp/clang";
import { File, OpenFile, ConsoleStdout, WASI, WASIProcExit } from "@bjorn3/browser_wasi_shim";
import { compileEngine, engineArgs, engineResult } from "../../site/run/cpp/engine-host.mjs";

// The build copies runtimes/<library>/ to run/vendor/<library>/<version>/.
const readLibrary = (path) => readFile(new URL(`../../runtimes/${path.split("/")[0]}/${path.split("/").pop()}`, import.meta.url), "utf8");

export async function cppEngine(name) {
  const source = await readFile(new URL(`../../site/run/cpp/engines/${name}.cc`, import.meta.url), "utf8");
  const wasm = await compileEngine(runClang, name, source, readLibrary);
  const module = await WebAssembly.compile(wasm);
  return async function analyze(input) {
    let stdout = "";
    const decoder = new TextDecoder();
    const wasi = new WASI(engineArgs(name, input), [], [new OpenFile(new File([])), new ConsoleStdout((b) => (stdout += decoder.decode(b, { stream: true }))), new ConsoleStdout(() => {})]);
    let trap = null;
    try {
      wasi.start(await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport }));
    } catch (error) {
      if (!(error instanceof WASIProcExit)) trap = String(error);
    }
    return engineResult(name, stdout, trap);
  };
}
