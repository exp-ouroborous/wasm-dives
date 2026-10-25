import test from "node:test";
import assert from "node:assert/strict";
import { loadPyodide } from "pyodide";
import { runInHarness } from "../site/run/python/harness.mjs";

const pyodide = await loadPyodide({ packages: [] });

test("output without a trailing newline stays in its own run and does not leak into the next", async () => {
  const first = await runInHarness(pyodide, 'print("first", end="")');
  assert.equal(first.out, "first");
  const second = await runInHarness(pyodide, 'print("second")');
  assert.equal(second.out, "second\n");
});

test("the final expression's repr is computed in Python, keeping floats and signed zero", async () => {
  assert.equal((await runInHarness(pyodide, "1.0")).value, "1.0");
  assert.equal((await runInHarness(pyodide, "-0.0")).value, "-0.0");
  assert.equal((await runInHarness(pyodide, "'x' * 2")).value, "'xx'");
  assert.equal((await runInHarness(pyodide, "None")).value, null);
  assert.equal((await runInHarness(pyodide, "x = 3")).value, null);
});

test("an exception keeps earlier output and returns a traceback naming only the program's lines", async () => {
  const result = await runInHarness(pyodide, 'print("before")\n1/0');
  assert.equal(result.out, "before\n");
  assert.match(result.error, /File "<exec>", line 2, in <module>/);
  assert.match(result.error, /ZeroDivisionError: division by zero/);
});

test("a syntax error is reported with its line", async () => {
  const result = await runInHarness(pyodide, "x = 1\ndef f(:\n  pass");
  assert.match(result.error, /File "<exec>", line 2/);
  assert.match(result.error, /SyntaxError/);
});

test("stderr writes are captured per run", async () => {
  const result = await runInHarness(pyodide, 'import sys\nsys.stderr.write("warn")');
  assert.equal(result.err, "warn");
});

test("runs do not share variables", async () => {
  await runInHarness(pyodide, "secret = 42");
  const result = await runInHarness(pyodide, "secret");
  assert.match(result.error, /NameError/);
});
