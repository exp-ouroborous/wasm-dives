import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as programs from "../site/cards/rust/programs.mjs";

const html = await readFile(new URL("../site/cards/rust/index.html", import.meta.url), "utf8");
const card = await readFile(new URL("../site/cards/rust/card.mjs", import.meta.url), "utf8");

test("the Rust card is labelled experimental and says Miri interprets rather than compiles", () => {
  assert.match(html, /<h1>Rust in your browser<\/h1>/);
  assert.match(html, /class="chip-experimental">Experimental</);
  assert.match(html, /Miri, Rust's own interpreter/);
  assert.match(html, /interprets your program rather than compiling it/);
  assert.match(html, /about 60 MB compressed/);
});

test("the Rust card has the shared regions and a sandboxed runner", () => {
  for (const id of ["runtime", "scratchpad", "experiments", "probes", "language-logo"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /sandbox="allow-scripts allow-same-origin"/);
  assert.doesNotMatch(html + card, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.match(card, /startLanguageCard\(\{\s*language: "rust"/);
});

test("the card offers two experiments and a probe", () => {
  assert.deepEqual(programs.EXPERIMENTS.map((e) => e.id), ["ownership", "traits"]);
  assert.match(programs.PROBE_SOURCE, /std::env::consts::ARCH/);
});
