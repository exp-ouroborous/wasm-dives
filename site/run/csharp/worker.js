// The C# runtime: Roslyn on .NET WebAssembly, our own build (runtimes/csharp),
// in this dedicated worker so the runner can terminate it. runtime.mjs is
// written by the build and points at this build's vendored dotnet.js.
import { dotnet } from "./runtime.mjs";
import { serveRuntime } from "../shared/runtime-worker.mjs";

serveRuntime({
  async boot() {
    const { getAssemblyExports, getConfig } = await dotnet.create();
    const { Runner } = await getAssemblyExports(getConfig().mainAssemblyName);
    // Warm Roslyn with a throwaway compile so the first Run is not the slow one.
    await Runner.Run('System.Console.WriteLine("warm");');
    return { runtime: Runner, version: Runner.Version() };
  },
  async run(runner, source) {
    return JSON.parse(await runner.Run(source));
  },
});
