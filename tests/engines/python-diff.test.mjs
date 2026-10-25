import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadPyodide } from "pyodide";
import { CASES, checkCase } from "./diff-contract.mjs";

const pyodide = await loadPyodide({ packages: [] });
const namespace = pyodide.globals.get("dict")();
pyodide.runPython(await readFile(new URL("../../site/run/python/engines/diff.py", import.meta.url), "utf8"), { globals: namespace });
const handle = namespace.get("handle");
const diff = async (input) => JSON.parse(handle(JSON.stringify(input)));

for (const testCase of CASES) test(`python diff: ${testCase.name}`, () => checkCase("python", testCase, diff));
