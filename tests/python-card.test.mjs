import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EXPERIMENTS, PROBE_SOURCE, SCRATCHPAD_DEFAULT } from "../site/cards/python/programs.mjs";

const html = await readFile(new URL("../site/cards/python/index.html", import.meta.url), "utf8");
const card = await readFile(new URL("../site/cards/python/card.mjs", import.meta.url), "utf8");

test("the Python card says what it is, in the agreed words", () => {
  assert.match(html, /<h1>Python in your browser<\/h1>/);
  assert.match(html, /Real CPython 3\.14, compiled to WebAssembly by Pyodide, running in a sandbox — nothing leaves the page\./);
  assert.match(html, /The standard library is built in\. Packages such as <code>numpy<\/code> load on first import from the pinned Pyodide 314\.0\.7 release, each checked against its lock-file hash\./);
});

test("the Python card has the shared regions, a sandboxed runner and a link to the Pyodide dive", () => {
  for (const id of ["runtime", "scratchpad", "experiments", "probes", "language-logo"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /sandbox="allow-scripts allow-same-origin"/);
  assert.match(html, /href="\/learn\/pyodide\/"[^>]*>More Pyodide experiments →<\/a>/);
  assert.doesNotMatch(html + card, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.match(card, /startLanguageCard\(\{\s*language: "python"/);
});

test("the Python card offers CSV and dataclasses experiments and a standard-library probe", () => {
  assert.deepEqual(EXPERIMENTS.map((e) => e.id), ["csv", "dataclasses"]);
  assert.match(PROBE_SOURCE, /sys\.version/);
  assert.match(SCRATCHPAD_DEFAULT, /print\(/);
});
