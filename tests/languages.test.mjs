import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LANGUAGES, languageStyle } from "../site/cards/wasm-assets/languages.mjs";

test("every language has a label, colours and an SVG logo path", () => {
  for (const [id, lang] of Object.entries(LANGUAGES)) {
    assert.match(lang.label, /\S/, id);
    assert.match(lang.color, /^#[0-9a-f]{6}$/, id);
    assert.match(lang.keyline, /^#[0-9a-f]{6}$/, id);
    assert.match(lang.logo.path, /^M[-0-9.,\sA-Za-z]+$/, id);
    assert.match(lang.logo.title, /\S/, id);
  }
});

test("C# uses the .NET logo and purple, Python its own", () => {
  assert.equal(LANGUAGES.csharp.color, "#512bd4");
  assert.equal(LANGUAGES.csharp.logo.title, ".NET");
  assert.equal(LANGUAGES.python.color, "#3776ab");
  assert.equal(LANGUAGES.python.logo.title, "Python");
});

test("Go uses its own blue and logo", () => {
  assert.equal(LANGUAGES.go.color, "#00add8");
  assert.equal(LANGUAGES.go.dark, "#007d9c");
  assert.equal(LANGUAGES.go.keyline, "#5dc9e2");
  assert.equal(LANGUAGES.go.logo.title, "Go");
});

test("C/C++ uses C++ blue and the C++ logo", () => {
  assert.equal(LANGUAGES.cpp.color, "#00599c");
  assert.equal(LANGUAGES.cpp.logo.title, "C++");
});

test("languageStyle sets the card accent from the language colour", () => {
  assert.equal(languageStyle("csharp"), "--accent: #512bd4; --accent-dark: #3d1fa3; --keyline: #9b87f5");
});

test("the C# card page takes its colour and logo from the shared table", async () => {
  const html = await readFile(new URL("../site/cards/csharp/index.html", import.meta.url), "utf8");
  const card = await readFile(new URL("../site/cards/csharp/card.mjs", import.meta.url), "utf8");
  assert.match(html, /id="language-logo"/);
  assert.doesNotMatch(html, /--accent: #68217a/);
  assert.match(card, /language: "csharp"/);
});
