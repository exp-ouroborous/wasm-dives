// Map what yaegiRun returns onto the runner's result shape. A positioned
// error ("2:15: undefined: x") is a compile error; anything else (panics,
// deadlocks) happened while running.

const POSITIONED = /^(\d+):(\d+): (.*)$/s;

export function toRunResult({ stdout, stderr, error }) {
  if (!error) return { ok: true, stdout, stderr, diagnostics: [] };
  const match = POSITIONED.exec(error);
  if (match && !/panic:/.test(stderr)) {
    const [, line, col, message] = match;
    return {
      ok: false,
      stdout,
      stderr,
      diagnostics: [{ id: "go", message, severity: "Error", line: Number(line), col: Number(col), start: 0, end: 0 }],
    };
  }
  return { ok: false, stdout, stderr: [stderr.trimEnd(), error].filter(Boolean).join("\n"), diagnostics: [] };
}
