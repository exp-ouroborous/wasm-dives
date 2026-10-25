import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadPyodide } from "pyodide";
import { CASES, checkCase } from "./json-contract.mjs";

const pyodide = await loadPyodide({ packages: [] });
const namespace = pyodide.globals.get("dict")();
pyodide.runPython(await readFile(new URL("../../site/run/python/engines/json.py", import.meta.url), "utf8"), { globals: namespace });
const handle = namespace.get("handle");
const analyze = async (input) => JSON.parse(handle(JSON.stringify(input)));

for (const testCase of CASES) test(`python json: ${testCase.name}`, () => checkCase("python", testCase, analyze));

// Healing is Python-only; these came with the engine from misc-dives' tool.py.
const heal = (source) => analyze({ action: "heal", source, indent: 2, sort_keys: true, allow_jsonc: false });

test("python json heal: quotes bare keys and values, closes the brace", async () => {
  const result = await heal("{name:Ada, active:true");
  assert.equal(result.ok, true);
  assert.equal(result.repaired, true);
  assert.equal(result.output, '{\n  "active": true,\n  "name": "Ada"\n}');
  const repairs = result.repairs.join(" ");
  for (const fix of ["quoted bare key", "quoted bare string value", "appended missing closing"]) assert.match(repairs, new RegExp(fix));
});

test("python json heal: inserts a missing comma between members", async () => {
  const result = await heal('{"name":"Ada" "active":true}');
  assert.equal(result.output, '{\n  "active": true,\n  "name": "Ada"\n}');
  assert.match(result.repairs.join(" "), /inserted missing comma/);
  assert.equal(result.repaired_source, '{"name":"Ada", "active":true}');
  assert.ok(result.diff_segments.some((s) => s.added && s.text === ","));
});

test("python json heal: closes a string that runs into the next key", async () => {
  const result = await heal('{"name":"Ada "active":true}');
  assert.equal(result.output, '{\n  "active": true,\n  "name": "Ada"\n}');
  assert.match(result.repairs.join(" "), /closed unterminated string value/);
  assert.equal(result.repaired_source, '{"name":"Ada", "active":true}');
  assert.ok(result.diff_segments.some((s) => s.added && s.text.includes('"')));
});

test("python json heal: refuses input it cannot fix", async () => {
  const result = await heal("{name:}");
  assert.equal(result.ok, false);
  assert.equal(result.repaired, false);
  assert.match(result.error, /Expecting value/);
});
