// The Python runtime: CPython 3.14 compiled to WebAssembly by Pyodide, in this
// dedicated worker so the runner can terminate it. The core files are
// vendored; packages imported by the program load on demand from the matching
// pinned Pyodide release, each checked against pyodide-lock.json's SHA-256.
import { serveRuntime } from "../shared/runtime-worker.mjs";
import { runInHarness } from "./harness.mjs";
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
    const notes = [];
    let packageErrors = "";
    try {
      await pyodide.loadPackagesFromImports(source, {
        messageCallback: (message) => {
          const loaded = /^Loaded (.+)$/.exec(message);
          if (loaded) notes.push(...loaded[1].split(", "));
        },
        errorCallback: (message) => (packageErrors += `${message}\n`),
      });
    } catch (error) {
      return toRunResult({ out: "", err: packageErrors, value: null, error: String(error?.message ?? error), notes });
    }
    const { out, err, value, error } = await runInHarness(pyodide, source);
    return toRunResult({ out, err: packageErrors + err, value, error, notes });
  },
});
