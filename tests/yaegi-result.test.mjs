import test from "node:test";
import assert from "node:assert/strict";
import { toRunResult } from "../site/run/go/yaegi-result.mjs";

test("a positioned error without a panic is a compile diagnostic", () => {
  const result = toRunResult({ stdout: "", stderr: "", error: "2:15: undefined: undefinedThing" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics, [{ id: "go", message: "undefined: undefinedThing", severity: "Error", line: 2, col: 15, start: 0, end: 0 }]);
});

test("a panic is a runtime error carrying Yaegi's stderr and the message", () => {
  const result = toRunResult({ stdout: "", stderr: "2:19: panic: main.main(...)\n", error: "assignment to entry in nil map" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.stderr, /2:19: panic: main\.main/);
  assert.match(result.stderr, /assignment to entry in nil map/);
});

test("a deadlock is a runtime error", () => {
  const result = toRunResult({ stdout: "", stderr: "", error: "all goroutines are asleep - deadlock!" });
  assert.equal(result.ok, false);
  assert.match(result.stderr, /deadlock/);
});

test("no error means success with the program's output", () => {
  assert.deepEqual(toRunResult({ stdout: "hi\n", stderr: "", error: "" }), { ok: true, stdout: "hi\n", stderr: "", diagnostics: [] });
});
