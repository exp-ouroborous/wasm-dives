// The C# runtime: Roslyn on .NET WebAssembly (WasmSharp), in this dedicated
// worker so the runner can terminate it. Bundled by the build (see
// runtimes.json) because dotnet.js uses bundler-style asset imports.
import { WasmSharpWorker } from "../vendor/wasmsharp/0.10.2/WasmSharpWorker.js";
import { serveRuntime } from "../shared/runtime-worker.mjs";

async function compileAndRun(module, source) {
  const compilation = await module.createCompilationAsync(source);
  return compilation.run();
}

function diagnostic(d) {
  return { id: d.id, message: d.message, severity: d.severity, start: d.location?.start ?? 0, end: d.location?.end ?? 0 };
}

serveRuntime({
  async boot() {
    const module = await WasmSharpWorker.initializeAsync({ assembliesUrl: new URL("./", import.meta.url).href }, {});
    const probe = await compileAndRun(module, "System.Console.WriteLine(System.Environment.Version);");
    return { runtime: module, version: (probe.stdOut ?? "").trim() };
  },
  async run(module, source) {
    const result = await compileAndRun(module, source);
    return {
      ok: result.success,
      stdout: result.stdOut ?? "",
      stderr: result.stdErr ?? "",
      diagnostics: (result.diagnostics ?? []).map(diagnostic),
    };
  },
});
