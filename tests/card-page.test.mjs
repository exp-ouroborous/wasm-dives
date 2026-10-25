import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../site/cards/wasm-assets/card-page.mjs", import.meta.url), "utf8");
const csharp = await readFile(new URL("../site/cards/csharp/card.mjs", import.meta.url), "utf8");

test("the shared card page never writes HTML from strings", () => {
  assert.doesNotMatch(page, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test("the C# card is configuration plus one call to the shared card page", () => {
  assert.ok(csharp.split("\n").length < 30, `card.mjs has ${csharp.split("\n").length} lines`);
  assert.match(csharp, /startLanguageCard\(\{\s*language: "csharp"/);
});

test("the shared card page themes, frames and labels by language", () => {
  assert.match(page, /languageStyle\(language\)/);
  assert.match(page, /languageLogo\(language[,)]/);
  assert.match(page, /\/run\/\$\{language\}\//);
  assert.match(page, /the next Run restarts the \$\{runtimeLabel\} runtime/);
});

test("the shared card page sends scratchpad, experiment and probe options", () => {
  assert.match(page, /scratchpadOptions/);
  assert.match(page, /experiment\.options/);
  assert.match(page, /PROBE_OPTIONS/);
});
