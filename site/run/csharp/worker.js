import { WasmSharpWorker } from "../vendor/wasmsharp/0.10.2/WasmSharpWorker.js";

const module = await WasmSharpWorker.initializeAsync(
  { assembliesUrl: new URL("./", import.meta.url).href },
  {},
);
const compilation = await module.createCompilationAsync('System.Console.WriteLine("hello from C#");');
const result = await compilation.run();
postMessage({ success: result.success, stdout: result.stdOut, diagnostics: result.diagnostics });
