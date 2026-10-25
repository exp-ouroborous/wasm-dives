// Compiles a C/C++ engine source with YoWASP clang (the compiler the browser
// card uses) and runs it under the same WASI shim and argv mapping.
import { readFile } from "node:fs/promises";
import { runClang } from "@yowasp/clang";
import { File, OpenFile, ConsoleStdout, WASI, WASIProcExit } from "@bjorn3/browser_wasi_shim";
import { engineArgs, engineResult } from "../../site/run/cpp/engine-host.mjs";

export async function cppEngine(name) {
  const source = await readFile(new URL(`../../site/run/cpp/engines/${name}.cc`, import.meta.url), "utf8");
  const { "engine.wasm": wasm } = await runClang(
    ["clang++", "engine.cc", "-std=c++23", "-O2", "-fno-exceptions", "-o", "engine.wasm"],
    { "engine.cc": source },
  );
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
