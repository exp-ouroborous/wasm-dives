import test from "node:test";
import assert from "node:assert/strict";
import { cleanTraceback, toRunResult } from "../site/run/python/py-result.mjs";

const ZERO = "Traceback (most recent call last):\n  File \"/lib/python314.zip/_pyodide/_base.py\", line 619, in eval_code_async\n    await CodeRunner(\n    ...<10 lines>...\n    .run_async(globals, locals)\n  File \"/lib/python314.zip/_pyodide/_base.py\", line 420, in run_async\n    coroutine = eval(self.code, globals, locals)\n  File \"<exec>\", line 2, in <module>\nZeroDivisionError: division by zero\n";
const NESTED = "Traceback (most recent call last):\n  File \"/lib/python314.zip/_pyodide/_base.py\", line 619, in eval_code_async\n    await CodeRunner(\n    ...<10 lines>...\n    .run_async(globals, locals)\n  File \"/lib/python314.zip/_pyodide/_base.py\", line 420, in run_async\n    coroutine = eval(self.code, globals, locals)\n  File \"<exec>\", line 5, in <module>\n  File \"<exec>\", line 2, in g\n  File \"<exec>\", line 4, in h\nValueError: bad value\n";
const SYNTAX = "Traceback (most recent call last):\n  File \"/lib/python314.zip/_pyodide/_base.py\", line 151, in _parse_and_compile_gen\n    mod = compile(source, filename, mode, flags | ast.PyCF_ONLY_AST)\n  File \"<exec>\", line 2\n    def f(:\n          ^\nSyntaxError: invalid syntax\n";
const INDENT = "Traceback (most recent call last):\n  File \"/lib/python314.zip/_pyodide/_base.py\", line 151, in _parse_and_compile_gen\n    mod = compile(source, filename, mode, flags | ast.PyCF_ONLY_AST)\n  File \"<exec>\", line 2\n    print(1)\n    ^^^^^\nIndentationError: expected an indented block after 'if' statement on line 1\n";

test("cleanTraceback keeps only the user's frames", () => {
  assert.equal(cleanTraceback(NESTED), "Traceback (most recent call last):\n  File \"<exec>\", line 5, in <module>\n  File \"<exec>\", line 2, in g\n  File \"<exec>\", line 4, in h\nValueError: bad value");
});

test("a runtime exception keeps earlier output and shows the cleaned traceback", () => {
  const result = toRunResult({ out: "before\n", err: "", value: null, error: ZERO });
  assert.equal(result.ok, false);
  assert.equal(result.stdout, "before\n");
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.stderr, /File "<exec>", line 2, in <module>\nZeroDivisionError: division by zero$/);
  assert.doesNotMatch(result.stderr, /_pyodide/);
});

test("syntax and indentation errors become line diagnostics", () => {
  assert.deepEqual(toRunResult({ out: "", err: "", value: null, error: SYNTAX }).diagnostics, [
    { id: "python", message: "SyntaxError: invalid syntax", severity: "Error", line: 2, col: 0, start: 0, end: 0 },
  ]);
  assert.equal(toRunResult({ out: "", err: "", value: null, error: INDENT }).diagnostics[0].message, "IndentationError: expected an indented block after 'if' statement on line 1");
});

test("a last-expression value is shown after the output", () => {
  assert.deepEqual(toRunResult({ out: "hi\n", err: "", value: "2", error: null }), { ok: true, stdout: "hi\n=> 2\n", stderr: "", diagnostics: [] });
});

test("package-load notes come first", () => {
  assert.equal(toRunResult({ out: "x\n", err: "", value: null, error: null, notes: ["numpy"] }).stdout, "(loaded numpy)\nx\n");
});

test("a non-traceback error (e.g. a failed package download) goes to stderr", () => {
  const result = toRunResult({ out: "", err: "", value: null, error: "Failed to fetch numpy" });
  assert.equal(result.ok, false);
  assert.equal(result.stderr, "Failed to fetch numpy");
});
