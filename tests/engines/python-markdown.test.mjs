import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadPyodide } from "pyodide";
import { CASES, checkCase } from "./markdown-contract.mjs";
import { fetchWheel } from "../../scripts/wheels.mjs";

// The same pinned wheel the build vendors, plus bleach from Pyodide's lock.
const runtimes = JSON.parse(await readFile(new URL("../../runtimes.json", import.meta.url), "utf8"));
const wheels = await Promise.all(runtimes.python.wheels.files.map((w) => fetchWheel(w, new URL("../../.cache/wheels", import.meta.url).pathname)));
const pyodide = await loadPyodide({ packages: [] });
await pyodide.loadPackage([...wheels.map((path) => `file://${path}`), "bleach"]);
const namespace = pyodide.globals.get("dict")();
pyodide.runPython(await readFile(new URL("../../site/run/python/engines/markdown.py", import.meta.url), "utf8"), { globals: namespace });
const handle = namespace.get("handle");
const convert = async (input) => JSON.parse(handle(JSON.stringify(input)));

for (const testCase of CASES) test(`python markdown: ${testCase.name}`, () => checkCase("python", testCase, convert));
