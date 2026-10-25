import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as programs from "../site/cards/cpp/programs.mjs";

const html = await readFile(new URL("../site/cards/cpp/index.html", import.meta.url), "utf8");
const card = await readFile(new URL("../site/cards/cpp/card.mjs", import.meta.url), "utf8");

test("the C/C++ card says what it is, in the agreed words", () => {
  assert.match(html, /<h1>C and C\+\+ in your browser<\/h1>/);
  assert.match(html, /The real Clang compiler, built for WebAssembly, compiles your program to WebAssembly and runs it — nothing leaves the page\./);
  assert.match(html, /C\+\+ is compiled without exceptions \(this libc\+\+ build has none\), so <code>throw<\/code> and <code>try<\/code> do not compile\. Programs run with WASI: standard input is empty and there is no network or real filesystem\./);
});

test("the C/C++ card has the shared regions, a dialect picker and a sandboxed runner", () => {
  for (const id of ["runtime", "scratchpad", "experiments", "probes", "language-logo", "dialect"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<option value="cpp"[^>]*>C\+\+ \(C\+\+23\)<\/option>/);
  assert.match(html, /<option value="c">C \(C17\)<\/option>/);
  assert.match(html, /sandbox="allow-scripts allow-same-origin"/);
  assert.doesNotMatch(html + card, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.match(card, /startLanguageCard\(\{\s*language: "cpp"/);
  assert.match(card, /scratchpadOptions/);
});

test("experiments cover both dialects and the probe runs as C++", () => {
  assert.deepEqual(programs.EXPERIMENTS.map((e) => [e.id, e.options.dialect]), [["templates", "cpp"], ["structs", "c"]]);
  assert.deepEqual(programs.PROBE_OPTIONS, { dialect: "cpp" });
  assert.match(programs.SCRATCHPAD_DEFAULT_C, /#include <stdio\.h>/);
});

test("the probe sums in a 64-bit integer, since long is 32-bit on wasm32", () => {
  assert.match(programs.PROBE_SOURCE, /long long sum/);
});

test("no bundled C++ program uses exceptions", () => {
  const cpp = [programs.SCRATCHPAD_DEFAULT, programs.PROBE_SOURCE, programs.EXPERIMENTS[0].source];
  for (const source of cpp) assert.doesNotMatch(source, /\bthrow\b|\btry\b/);
});
