// Shared assertions for every regex engine: run each case through `analyze`
// (input object -> output object) for the named language.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export const CASES = JSON.parse(await readFile(new URL("./regex-cases.json", import.meta.url), "utf8"));

export async function checkCase(language, testCase, analyze) {
  const input = { ...testCase.input, pattern: testCase.patterns?.[language] ?? testCase.input.pattern };
  const output = await analyze(input);
  const errors = testCase.expect_error ?? {};
  const expectedError = errors[language] ?? errors["*"];
  if (expectedError !== undefined) {
    assert.equal(output.ok, false, `${testCase.name}: expected an error`);
    assert.match(output.error, new RegExp(expectedError, "i"));
    return;
  }
  assert.equal(output.ok, true, `${testCase.name}: ${output.error}`);
  assert.match(output.engine, /\S/);
  const { expect } = testCase;
  if (expect.match_count !== undefined) assert.equal(output.match_count, expect.match_count, testCase.name);
  if (expect.full_match !== undefined) assert.equal(output.full_match, expect.full_match, testCase.name);
  if (expect.substitution !== undefined) assert.equal(output.substitution, expect.substitution, testCase.name);
  if (expect.first) {
    const first = output.matches[0];
    for (const [key, value] of Object.entries(expect.first)) assert.deepEqual(first[key], value, `${testCase.name}: ${key}`);
  }
}
