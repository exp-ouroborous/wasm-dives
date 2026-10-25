import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EXPERIMENTS, PROBE_SOURCE, SCRATCHPAD_DEFAULT } from "../site/cards/go/programs.mjs";

const html = await readFile(new URL("../site/cards/go/index.html", import.meta.url), "utf8");
const card = await readFile(new URL("../site/cards/go/card.mjs", import.meta.url), "utf8");

test("the Go card says what it is, in the agreed words", () => {
  assert.match(html, /<h1>Go in your browser<\/h1>/);
  assert.match(html, /A Go interpreter \(Yaegi\) compiled to WebAssembly, running Go 1\.22-era programs — nothing leaves the page\./);
  assert.match(html, /This is an interpreter, not the Go compiler: programs run slower than compiled Go, and a few things are missing — the <code>min<\/code> and <code>max<\/code> built-ins, generic standard-library functions such as <code>slices\.Sort<\/code>, and type inference for functions with two type parameters \(write <code>Map\[int, string\]\(…\)<\/code>\)\./);
});

test("the Go card has the shared regions, a sandboxed runner and its logo", () => {
  for (const id of ["runtime", "scratchpad", "experiments", "probes", "language-logo"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<progress/);
  assert.match(html, /sandbox="allow-scripts allow-same-origin"/);
  assert.doesNotMatch(html + card, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.match(card, /startLanguageCard\(\{\s*language: "go"/);
});

test("the Go card offers goroutines and generics experiments", () => {
  assert.deepEqual(EXPERIMENTS.map((e) => e.id), ["goroutines", "generics"]);
});

test("bundled Go programs avoid the interpreter's known gaps", () => {
  for (const source of [SCRATCHPAD_DEFAULT, PROBE_SOURCE, ...EXPERIMENTS.map((e) => e.source)]) {
    assert.doesNotMatch(source, /\bmin\(|\bmax\(|slices\.|maps\./);
  }
});
