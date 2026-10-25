// Shared assertions for every JSON engine.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export const CASES = JSON.parse(await readFile(new URL("./json-cases.json", import.meta.url), "utf8"));

function walk(node, visit) {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

export async function checkCase(language, testCase, analyze) {
  const output = await analyze(testCase.input);
  assert.match(output.engine ?? "", /\S/, `${testCase.name}: engine name`);
  if (testCase.unsupported_elsewhere && !testCase.only?.[language]) {
    assert.equal(output.ok, false, testCase.name);
    assert.equal(output.unsupported, true, testCase.name);
    assert.match(output.error, /only available in Python/);
    return;
  }
  if (testCase.expect_error) {
    assert.equal(output.ok, false, `${testCase.name}: expected an error`);
    assert.equal(output.line, testCase.expect_error.line, `${testCase.name}: line`);
    assert.ok(output.column >= 1, `${testCase.name}: column`);
    assert.match(output.error, /\S/);
    return;
  }
  assert.equal(output.ok, true, `${testCase.name}: ${output.error}`);
  const expect = testCase.only?.[language] ?? testCase.expect;
  if (expect.output !== undefined) assert.equal(output.output, expect.output, testCase.name);
  if (expect.summary) assert.deepEqual(output.summary, expect.summary, testCase.name);
  if (expect.paths) {
    const paths = [];
    walk(output.tree, (n) => paths.push(n.path));
    assert.deepEqual(paths, expect.paths, testCase.name);
  }
  for (const key of ["node", "copy"]) {
    if (!expect[key]) continue;
    let found = null;
    walk(output.tree, (n) => { if (n.path === expect[key].path) found = n; });
    assert.ok(found, `${testCase.name}: node ${expect[key].path}`);
    for (const [field, value] of Object.entries(expect[key])) assert.deepEqual(found[field], value, `${testCase.name}: ${field}`);
  }
}
