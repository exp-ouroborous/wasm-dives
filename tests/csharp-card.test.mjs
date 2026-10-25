import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EXPERIMENTS, PROBE_SOURCE, SCRATCHPAD_DEFAULT } from "../site/cards/csharp/programs.mjs";

const html = await readFile(new URL("../site/cards/csharp/index.html", import.meta.url), "utf8");
const card = await readFile(new URL("../site/cards/csharp/card.mjs", import.meta.url), "utf8");

test("the C# card has its runtime, scratchpad, experiments and probes regions", () => {
  assert.match(html, /C# in your browser/);
  assert.match(html, /Real C# compiled by Roslyn, running on \.NET WebAssembly — nothing leaves the page\./);
  assert.match(html, /id="scratchpad"/);
  assert.match(html, /id="experiments"/);
  assert.match(html, /id="probes"/);
  assert.match(html, /<progress/);
});

test("the runner iframe is sandboxed to scripts plus its own origin", () => {
  assert.match(html, /sandbox="allow-scripts allow-same-origin"/);
});

test("neither the page nor its script writes HTML from strings", () => {
  assert.doesNotMatch(html, /innerHTML/);
  assert.doesNotMatch(card, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test("programs offer two experiments, a probe and a default scratchpad", () => {
  assert.equal(EXPERIMENTS.length, 2);
  assert.deepEqual(EXPERIMENTS.map((e) => e.id), ["linq-csv", "records"]);
  assert.match(PROBE_SOURCE, /Environment\.Version/);
  assert.match(SCRATCHPAD_DEFAULT, /Console\.WriteLine/);
});

// WasmSharp 0.10.2 compiles against trimmed assemblies; these compile errors
// were observed in the browser. Keep the bundled programs clear of them.
const TRIMMED_APIS = [/Math\.PI/, /OSDescription/, /ProcessArchitecture/, /Stopwatch/, /\{[^}]*,-?\d+[^}]*\}/, /\{[^}]*:[A-Z]\d*\}/, /\.Sum\(/];

test("bundled programs avoid APIs missing from WasmSharp's trimmed library", () => {
  for (const source of [SCRATCHPAD_DEFAULT, PROBE_SOURCE, ...EXPERIMENTS.map((e) => e.source)]) {
    for (const api of TRIMMED_APIS) assert.doesNotMatch(source, api);
  }
});

test("the card says the C# library is trimmed", () => {
  assert.match(html, /trimmed/);
});
