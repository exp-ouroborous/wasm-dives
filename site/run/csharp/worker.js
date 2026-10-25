// The C# runtime: Roslyn on .NET WebAssembly, our own build (runtimes/csharp),
// in this dedicated worker so the runner can terminate it. runtime.mjs is
// written by the build and points at this build's vendored dotnet.js.
import { dotnet } from "./runtime.mjs";
import { serveRuntime } from "../shared/runtime-worker.mjs";

// Tool engines (engines/<name>.cs), each compiled once by Roslyn and kept loaded.
const loadedEngines = new Set();

serveRuntime({
  async boot() {
    const { getAssemblyExports, getConfig } = await dotnet.create();
    const { Runner } = await getAssemblyExports(getConfig().mainAssemblyName);
    // Warm Roslyn with a throwaway compile so the first Run is not the slow one.
    await Runner.Run('System.Console.WriteLine("warm");');
    return { runtime: Runner, version: Runner.Version() };
  },
  async call(runner, name, input) {
    if (!loadedEngines.has(name)) {
      const response = await fetch(new URL(`./engines/${name}.cs`, import.meta.url));
      if (!response.ok) throw new Error(`no ${name} engine for C# (HTTP ${response.status})`);
      const failure = runner.LoadEngine(name, await response.text());
      if (failure) throw new Error(failure);
      loadedEngines.add(name);
    }
    return JSON.parse(runner.CallEngine(name, JSON.stringify(input)));
  },
  async run(runner, source) {
    return JSON.parse(await runner.Run(source));
  },
});
