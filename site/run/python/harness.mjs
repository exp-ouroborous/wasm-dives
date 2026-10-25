// Runs one program inside Python itself: stdout and stderr go to per-run
// StringIO buffers (so output without a trailing newline is neither lost nor
// carried into the next run), each run gets a fresh namespace, and the final
// expression's repr is computed in Python before any JavaScript conversion.

const HARNESS = `
import ast, contextlib, io, json, traceback

def _wasm_dives_run(source):
    out, err = io.StringIO(), io.StringIO()
    namespace = {"__name__": "__main__", "__builtins__": __builtins__}
    value = None
    error = None
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            tree = ast.parse(source, "<exec>", "exec")
            last = None
            if tree.body and isinstance(tree.body[-1], ast.Expr):
                last = ast.Expression(tree.body.pop().value)
            exec(compile(tree, "<exec>", "exec"), namespace)
            if last is not None:
                result = eval(compile(last, "<exec>", "eval"), namespace)
                if result is not None:
                    value = repr(result)
        except BaseException:
            error = traceback.format_exc()
    return json.dumps({"out": out.getvalue(), "err": err.getvalue(), "value": value, "error": error})
`;

const installed = new WeakSet();

export async function runInHarness(pyodide, source) {
  if (!installed.has(pyodide)) {
    pyodide.runPython(HARNESS, { filename: "<wasm-dives-runner>" });
    installed.add(pyodide);
  }
  const run = pyodide.globals.get("_wasm_dives_run");
  try {
    return JSON.parse(run(source));
  } finally {
    run.destroy();
  }
}
