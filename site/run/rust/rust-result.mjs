// Mapping Miri's output and exit onto the runner's result shape: rustc's
// diagnostics, panics (which end in a trap: this build aborts on panic) and
// plain runs.

const HEADER = /^(error|warning)(\[\w+\])?: (.*)$/;
const LOCATION = /^\s*--> main\.rs:(\d+):(\d+)$/;

// Diagnostics that point into main.rs; summaries such as "aborting due to…" have no position.
export function parseRustcDiagnostics(text) {
  const lines = text.split("\n");
  const diagnostics = [];
  for (let i = 0; i < lines.length; i++) {
    const header = HEADER.exec(lines[i]);
    const at = header && LOCATION.exec(lines[i + 1] ?? "");
    if (!at) continue;
    diagnostics.push({
      id: "rustc",
      message: lines[i],
      severity: header[1] === "warning" ? "Warning" : "Error",
      line: Number(at[1]),
      col: Number(at[2]),
      start: 0,
      end: 0,
    });
  }
  return diagnostics;
}

// The panic message, without the backtrace hint and Miri's abort report.
function panicMessage(stderr) {
  const lines = stderr.split("\n");
  const end = lines.findIndex((line) => line.startsWith("note: run with `RUST_BACKTRACE") || line.startsWith("error: abnormal termination"));
  return lines.slice(0, end === -1 ? undefined : end).join("\n").trimEnd();
}

export function toRunResult({ stdout, stderr, exit, trap }) {
  const diagnostics = parseRustcDiagnostics(stderr);
  if (diagnostics.some((d) => d.severity === "Error")) return { ok: false, stdout, stderr: stderr.trimEnd(), diagnostics };
  if (trap && /panicked at/.test(stderr)) return { ok: false, stdout, stderr: panicMessage(stderr), diagnostics: [] };
  const ok = !trap && exit === 0;
  if (ok) return { ok, stdout, stderr, diagnostics };
  const notes = [stderr.trimEnd()];
  notes.push(trap ? `trap: ${trap}` : `exit code ${exit}`);
  return { ok, stdout, stderr: notes.filter(Boolean).join("\n"), diagnostics };
}
