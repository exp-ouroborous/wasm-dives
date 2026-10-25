// Shared assertions for every Markdown engine. Libraries differ in markup
// detail, so cases check structure (substrings and patterns), not bytes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { unsupportedFeatures } from "../../site/cards/wasm-assets/markdown-features.mjs";

export const CASES = JSON.parse(await readFile(new URL("./markdown-cases.json", import.meta.url), "utf8"));

export async function checkCase(language, testCase, convert) {
  const output = await convert(testCase.input);
  assert.match(output.engine ?? "", /\S/, `${testCase.name}: engine name`);
  const missing = unsupportedFeatures(language, testCase.input.features);
  if (missing.length > 0) {
    // Never ignore a feature the engine lacks: refuse and name it.
    assert.equal(output.ok, false, `${testCase.name}: should refuse ${missing}`);
    assert.equal(output.unsupported, true, testCase.name);
    assert.deepEqual(output.unsupported_features, missing, testCase.name);
    assert.match(output.error, /not available/);
    return;
  }
  assert.equal(output.ok, true, `${testCase.name}: ${output.error}`);
  const html = output.html;
  if (testCase.html !== undefined) assert.equal(html.trim(), testCase.html, testCase.name);
  for (const text of testCase.contains ?? []) assert.ok(html.includes(text), `${testCase.name}: expected ${JSON.stringify(text)} in ${JSON.stringify(html)}`);
  for (const text of testCase.not_contains ?? []) assert.ok(!html.toLowerCase().includes(text.toLowerCase()), `${testCase.name}: unexpected ${JSON.stringify(text)} in ${JSON.stringify(html)}`);
  for (const pattern of testCase.matches ?? []) assert.match(html, new RegExp(pattern), `${testCase.name}: ${pattern} in ${JSON.stringify(html)}`);
}
