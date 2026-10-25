// The C# runtime: Roslyn on .NET WebAssembly (WasmSharp), in this dedicated
// worker so the runner can terminate it. Bundled by the build (see
// runtimes.json) because dotnet.js uses bundler-style asset imports.
import { WasmSharpWorker } from "../vendor/wasmsharp/0.10.2/WasmSharpWorker.js";

async function compileAndRun(module, source) {
  const compilation = await module.createCompilationAsync(source);
  return compilation.run();
}

const booting = (async () => {
  const module = await WasmSharpWorker.initializeAsync({ assembliesUrl: new URL("./", import.meta.url).href }, {});
  const probe = await compileAndRun(module, "System.Console.WriteLine(System.Environment.Version);");
  postMessage({ type: "booted", version: (probe.stdOut ?? "").trim() });
  return module;
})();

function diagnostic(d) {
  return { id: d.id, message: d.message, severity: d.severity, start: d.location?.start ?? 0, end: d.location?.end ?? 0 };
}

// Registered before the runtime finishes booting so an early Run is not lost.
self.addEventListener("message", async ({ data }) => {
  if (data?.type !== "run") return;
  const module = await booting;
  const started = performance.now();
  let result;
  try {
    const run = await compileAndRun(module, data.source);
    result = {
      ok: run.success,
      stdout: run.stdOut ?? "",
      stderr: run.stdErr ?? "",
      diagnostics: (run.diagnostics ?? []).map(diagnostic),
    };
  } catch (error) {
    result = { ok: false, stdout: "", stderr: String(error?.message ?? error), diagnostics: [] };
  }
  postMessage({ type: "result", id: data.id, ms: Math.round(performance.now() - started), ...result });
});
