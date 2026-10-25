import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadPyodide } from "pyodide";
import { CASES, checkCase } from "./regex-contract.mjs";

const pyodide = await loadPyodide({ packages: [] });
const namespace = pyodide.globals.get("dict")();
pyodide.runPython(await readFile(new URL("../../site/run/python/engines/regex.py", import.meta.url), "utf8"), { globals: namespace });
const handle = namespace.get("handle");
const analyze = async (input) => JSON.parse(handle(JSON.stringify(input)));

for (const testCase of CASES) test(`python regex: ${testCase.name}`, () => checkCase("python", testCase, analyze));
