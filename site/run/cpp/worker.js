// The C/C++ runtime: YoWASP's Clang/LLD in WebAssembly compiles the program
// to a WASI binary, which then runs here with browser_wasi_shim — all in this
// dedicated worker, so Stop ends a long compile or a runaway program alike.
// Clang's two biggest files arrive in parts (Pages' 25 MiB limit): the bundle
// fetches them itself, so fetch is wrapped to serve them from verified parts.
import { serveRuntime } from "../shared/runtime-worker.mjs";
import { installPartsFetch } from "../shared/parts.mjs";
import { compileArgs, toRunResult } from "./clang-result.mjs";
import { compileEngine, engineArgs, engineResult } from "./engine-host.mjs";

const CLANG = new URL("../vendor/yowasp-clang/22.0.0-git20542-10/gen/", import.meta.url);
const SHIM = new URL("../vendor/browser_wasi_shim/0.4.2/dist/index.js", import.meta.url);

// Tool engines (engines/<name>.cc), each compiled once to a WebAssembly module.
const engines = new Map();

async function engineModule(runClang, name) {
  if (!engines.has(name)) {
    const response = await fetch(new URL(`./engines/${name}.cc`, import.meta.url));
    if (!response.ok) throw new Error(`no ${name} engine for C/C++ (HTTP ${response.status})`);
    const errors = collector();
    const readLibrary = async (path) => {
      const library = await fetch(new URL(`../vendor/${path}`, import.meta.url));
      if (!library.ok) throw new Error(`${path}: HTTP ${library.status}`);
      return library.text();
    };
    let wasm;
    try {
      wasm = await compileEngine(runClang, name, await response.text(), readLibrary, { stdout: errors.write, stderr: errors.write });
    } catch (error) {
      throw new Error(`the ${name} engine failed to compile: ${errors.text || error.message}`);
    }
    engines.set(name, await WebAssembly.compile(wasm));
  }
  return engines.get(name);
}

function collector() {
  const decoder = new TextDecoder();
  let text = "";
  return {
    write: (bytes) => {
      if (bytes) text += decoder.decode(bytes, { stream: true });
    },
    get text() {
      return text + decoder.decode();
    },
  };
}

serveRuntime({
  async boot() {
    globalThis.fetch = installPartsFetch(
      [new URL("llvm.core.wasm", CLANG).href, new URL("llvm-resources.tar", CLANG).href],
      globalThis.fetch.bind(globalThis),
    );
    const [{ runClang }, shim] = await Promise.all([import(new URL("bundle.js", CLANG).href), import(SHIM.href)]);
    // Warm up: the first compile downloads and instantiates LLVM.
    await runClang(["clang", "warm.c", "-o", "warm.wasm"], { "warm.c": "int main(void) { return 0; }" });
    const version = collector();
    await runClang(["clang", "--version"], {}, { stdout: version.write, stderr: null });
    return { runtime: { runClang, shim }, version: version.text.split("\n")[0].trim() };
  },
  async run({ runClang, shim }, source, options) {
    const args = compileArgs(options.dialect);
    const clangOutput = collector();
    let files;
    try {
      files = await runClang(args, { [args[1]]: source }, { stdout: clangOutput.write, stderr: clangOutput.write });
    } catch {
      return toRunResult({ compiled: false, clangStderr: clangOutput.text });
    }
    const stdout = collector();
    const stderr = collector();
    const { WASI, WASIProcExit, File, OpenFile, ConsoleStdout } = shim;
    const wasi = new WASI([], [], [new OpenFile(new File([])), new ConsoleStdout(stdout.write), new ConsoleStdout(stderr.write)]);
    let exit = null;
    let trap = null;
    try {
      const { instance } = await WebAssembly.instantiate(files["app.wasm"], { wasi_snapshot_preview1: wasi.wasiImport });
      exit = wasi.start(instance);
    } catch (error) {
      if (error instanceof WASIProcExit) exit = error.code;
      else trap = String(error?.message ? `${error.name}: ${error.message}` : error);
    }
    return toRunResult({ compiled: true, stdout: stdout.text, stderr: stderr.text, exit, trap });
  },
  async call({ runClang, shim }, name, input) {
    const module = await engineModule(runClang, name);
    const { WASI, WASIProcExit, File, OpenFile, ConsoleStdout } = shim;
    const stdout = collector();
    const wasi = new WASI(engineArgs(name, input), [], [new OpenFile(new File([])), new ConsoleStdout(stdout.write), new ConsoleStdout(() => {})]);
    let trap = null;
    try {
      wasi.start(await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport }));
    } catch (error) {
      if (!(error instanceof WASIProcExit)) trap = String(error?.message ? `${error.name}: ${error.message}` : error);
    }
    return engineResult(name, stdout.text, trap);
  },
});
