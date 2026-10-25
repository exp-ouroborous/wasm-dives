import test from "node:test";
import assert from "node:assert/strict";
import { compileArgs, parseClangDiagnostics, toRunResult } from "../site/run/cpp/clang-result.mjs";

const ERROR_TEXT = "main.c:1:25: error: use of undeclared identifier 'undefined_thing'\n    1 | int main(void) { return undefined_thing; }\n      |                         ^~~~~~~~~~~~~~~\n1 error generated.\n";

test("parseClangDiagnostics reads errors from the joined stderr text", () => {
  assert.deepEqual(parseClangDiagnostics(ERROR_TEXT), [
    { id: "clang", message: "use of undeclared identifier 'undefined_thing'", severity: "Error", line: 1, col: 25, start: 0, end: 0 },
  ]);
});

test("parseClangDiagnostics maps warnings and fatal errors", () => {
  const text = "main.cc:3:5: warning: unused variable 'x' [-Wunused-variable]\nmain.cc:1:10: fatal error: 'nope.h' file not found\n";
  assert.deepEqual(parseClangDiagnostics(text).map((d) => [d.severity, d.line, d.col]), [["Warning", 3, 5], ["Error", 1, 10]]);
});

test("compileArgs gives the exact C and C++ flags, defaulting to C++", () => {
  assert.deepEqual(compileArgs("c"), ["clang", "main.c", "-std=c17", "-O2", "-o", "app.wasm"]);
  const cpp = ["clang++", "main.cc", "-std=c++23", "-O2", "-fno-exceptions", "-o", "app.wasm"];
  assert.deepEqual(compileArgs("cpp"), cpp);
  assert.deepEqual(compileArgs(undefined), cpp);
  assert.deepEqual(compileArgs("rust"), cpp);
});

test("a failed compile reports its diagnostics", () => {
  const result = toRunResult({ compiled: false, clangStderr: ERROR_TEXT });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.stderr, "");
});

test("a link error with no diagnostics shows the linker's message", () => {
  const text = "wasm-ld: error: /tmp/main.o: undefined symbol: __cxa_throw\nclang++: error: linker command failed\n";
  const result = toRunResult({ compiled: false, clangStderr: text });
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.stderr, /__cxa_throw/);
});

test("a non-zero exit code is a failure that keeps the output", () => {
  const result = toRunResult({ compiled: true, stdout: "partial\n", stderr: "", exit: 3, trap: null });
  assert.equal(result.ok, false);
  assert.equal(result.stdout, "partial\n");
  assert.match(result.stderr, /exit code 3$/);
});

test("a trap keeps earlier output and names the trap", () => {
  const result = toRunResult({ compiled: true, stdout: "before\n", stderr: "", exit: null, trap: "RuntimeError: unreachable" });
  assert.equal(result.ok, false);
  assert.equal(result.stdout, "before\n");
  assert.match(result.stderr, /trap: RuntimeError: unreachable/);
});

test("exit code 0 without a trap is success", () => {
  assert.deepEqual(toRunResult({ compiled: true, stdout: "hi\n", stderr: "", exit: 0, trap: null }), { ok: true, stdout: "hi\n", stderr: "", diagnostics: [] });
});
