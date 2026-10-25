// The Python runtime: CPython 3.14 compiled to WebAssembly by Pyodide, in this
// dedicated worker so the runner can terminate it. The core files are
// vendored; packages imported by the program load on demand from the matching
// pinned Pyodide release, each checked against pyodide-lock.json's SHA-256.
import { serveRuntime } from "../shared/runtime-worker.mjs";
import { toRunResult } from "./py-result.mjs";

const VENDOR = new URL("../vendor/pyodide/314.0.7/", import.meta.url);
const PACKAGES = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

serveRuntime({
  async boot() {
    const { loadPyodide } = await import(new URL("pyodide.mjs", VENDOR).href);
    const pyodide = await loadPyodide({ indexURL: VENDOR.href, packageBaseUrl: PACKAGES, packages: [] });
    const python = pyodide.runPython("import sys; sys.version.split()[0]");
    return { runtime: pyodide, version: `Python ${python} · Pyodide ${pyodide.version}` };
  },
  async run(pyodide, source) {
    let out = "";
    let err = "";
    const notes = [];
    pyodide.setStdout({ batched: (text) => (out += `${text}\n`) });
    pyodide.setStderr({ batched: (text) => (err += `${text}\n`) });
    const globals = pyodide.globals.get("dict")();
    try {
      await pyodide.loadPackagesFromImports(source, {
        messageCallback: (message) => {
          const loaded = /^Loaded (.+)$/.exec(message);
          if (loaded) notes.push(...loaded[1].split(", "));
        },
        errorCallback: (message) => (err += `${message}\n`),
      });
      const result = await pyodide.runPythonAsync(source, { globals });
      const value = result === undefined ? null : pyodide.globals.get("repr")(result);
      result?.destroy?.();
      return toRunResult({ out, err, value, error: null, notes });
    } catch (error) {
      return toRunResult({ out, err, value: null, error: String(error?.message ?? error), notes });
    } finally {
      globals.destroy();
    }
  },
});
