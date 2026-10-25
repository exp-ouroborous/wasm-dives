import test from "node:test";
import assert from "node:assert/strict";
import { parseRustcDiagnostics, toRunResult } from "../site/run/rust/rust-result.mjs";

// Real Miri output, from the spike in the phase 5 plan.
const COMPILE_ERROR = `error[E0277]: cannot add \`&str\` to \`{integer}\`
 --> main.rs:1:23
  |
1 | fn main() { let s = 5 + "a"; }
  |                       ^ no implementation for \`{integer} + &str\`
  |
  = help: the trait \`std::ops::Add<&str>\` is not implemented for \`{integer}\`

warning: unused variable: \`s\`
 --> main.rs:1:17
  |
1 | fn main() { let s = 5 + "a"; }
  |                 ^ help: if this is intentional, prefix it with an underscore: \`_s\`

error: aborting due to 1 previous error; 1 warning emitted

For more information about this error, try \`rustc --explain E0277\`.
`;

const PANIC = `thread 'main' panicked at main.rs:1:42:
called \`Option::unwrap()\` on a \`None\` value
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace
error: abnormal termination: the program aborted execution
 --> /home/lyon/Dev/Rust/miri-wasm-rustc/library/panic_abort/src/lib.rs:48:17
  |
  = note: the program aborted execution
`;

test("rustc diagnostics become positioned errors and warnings", () => {
  assert.deepEqual(parseRustcDiagnostics(COMPILE_ERROR).map(({ severity, message, line, col }) => ({ severity, message, line, col })), [
    { severity: "Error", message: "error[E0277]: cannot add `&str` to `{integer}`", line: 1, col: 23 },
    { severity: "Warning", message: "warning: unused variable: `s`", line: 1, col: 17 },
  ]);
});

test("a compile error is a failed run whose diagnostics carry the detail, with rustc's full text kept", () => {
  const result = toRunResult({ stdout: "", stderr: COMPILE_ERROR, exit: 1, trap: null });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.filter((d) => d.severity === "Error").length, 1);
  assert.match(result.stderr, /^error\[E0277\]/);
});

test("a panic shows the panic message without Miri's abort internals", () => {
  const result = toRunResult({ stdout: "partial\n", stderr: PANIC, exit: null, trap: "RuntimeError: unreachable" });
  assert.equal(result.ok, false);
  assert.equal(result.stdout, "partial\n");
  assert.equal(result.stderr, "thread 'main' panicked at main.rs:1:42:\ncalled `Option::unwrap()` on a `None` value");
  assert.deepEqual(result.diagnostics, []);
});

test("a clean run is ok; warnings alone do not fail it", () => {
  assert.deepEqual(toRunResult({ stdout: "hi\n", stderr: "", exit: 0, trap: null }), { ok: true, stdout: "hi\n", stderr: "", diagnostics: [] });
  const warned = toRunResult({ stdout: "hi\n", stderr: "warning: unused variable: `x`\n --> main.rs:2:9\n", exit: 0, trap: null });
  assert.equal(warned.ok, true);
  assert.equal(warned.diagnostics[0].severity, "Warning");
});

test("an unexpected trap or exit code is reported", () => {
  assert.match(toRunResult({ stdout: "", stderr: "", exit: null, trap: "RuntimeError: memory access out of bounds" }).stderr, /trap: RuntimeError: memory access out of bounds/);
  assert.match(toRunResult({ stdout: "", stderr: "", exit: 3, trap: null }).stderr, /exit code 3/);
});
