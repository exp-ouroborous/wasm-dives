// Compile flags for the C/C++ card, and mapping Clang's output and the
// program's exit onto the runner's result shape.

const DIAGNOSTIC = /^main\.(?:cc|c):(\d+):(\d+): (error|warning|fatal error): (.*)$/gm;

export function compileArgs(dialect) {
  if (dialect === "c") return ["clang", "main.c", "-std=c17", "-O2", "-o", "app.wasm"];
  // This libc++ build has no exception support, so C++ is compiled without it.
  return ["clang++", "main.cc", "-std=c++23", "-O2", "-fno-exceptions", "-o", "app.wasm"];
}

export function parseClangDiagnostics(text) {
  return [...text.matchAll(DIAGNOSTIC)].map(([, line, col, kind, message]) => ({
    id: "clang",
    message,
    severity: kind === "warning" ? "Warning" : "Error",
    line: Number(line),
    col: Number(col),
    start: 0,
    end: 0,
  }));
}

export function toRunResult(run) {
  if (!run.compiled) {
    const diagnostics = parseClangDiagnostics(run.clangStderr);
    const hasErrors = diagnostics.some((d) => d.severity === "Error");
    // Linker failures (e.g. using exceptions) come without a source position.
    return { ok: false, stdout: "", stderr: hasErrors ? "" : run.clangStderr.trimEnd(), diagnostics };
  }
  const { stdout, stderr, exit, trap } = run;
  const notes = [stderr.trimEnd()];
  if (trap) notes.push(`trap: ${trap}`);
  else if (exit !== 0) notes.push(`exit code ${exit}`);
  const ok = !trap && exit === 0;
  return { ok, stdout, stderr: ok ? stderr : notes.filter(Boolean).join("\n"), diagnostics: [] };
}
