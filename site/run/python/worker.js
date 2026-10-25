// The Python runtime: CPython 3.14 compiled to WebAssembly by Pyodide, in this
// dedicated worker so the runner can terminate it. The core files are
// vendored; packages imported by the program load on demand from the matching
// pinned Pyodide release, each checked against pyodide-lock.json's SHA-256.
import { serveRuntime } from "../shared/runtime-worker.mjs";
import { runInHarness } from "./harness.mjs";
import { toRunResult } from "./py-result.mjs";
import { enginePackages } from "./engine-packages.mjs";

const VENDOR = new URL("../vendor/pyodide/314.0.7/", import.meta.url);
const PACKAGES = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
const WHEELS = new URL("../vendor/python-wheels/", import.meta.url);

// Tool engines (engines/<name>.py), each loaded once into its own namespace.
const engines = new Map();

async function engine(pyodide, name) {
  if (!engines.has(name)) {
    const response = await fetch(new URL(`./engines/${name}.py`, import.meta.url));
    if (!response.ok) throw new Error(`no ${name} engine for Python (HTTP ${response.status})`);
    const packages = enginePackages(name, WHEELS);
    if (packages.length > 0) await pyodide.loadPackage(packages);
    const namespace = pyodide.globals.get("dict")();
    pyodide.runPython(await response.text(), { globals: namespace, filename: `<engine:${name}>` });
    engines.set(name, namespace.get("handle"));
  }
  return engines.get(name);
}

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
  async call(pyodide, name, input) {
    const handle = await engine(pyodide, name);
    return JSON.parse(handle(JSON.stringify(input)));
  },
});
