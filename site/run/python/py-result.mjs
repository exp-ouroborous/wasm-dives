// Map a Pyodide run onto the runner's result shape. Pyodide's own frames
// (/lib/python314.zip/_pyodide/…) are dropped from tracebacks so the reader
// sees only their program; syntax-class errors become line diagnostics.

const FRAME = /^ {2}File "(.*?)", line (\d+)/;
const SYNTAX = /^(SyntaxError|IndentationError|TabError): /;

export function cleanTraceback(message) {
  const lines = message.trimEnd().split("\n");
  const kept = [];
  let inUserFrame = false;
  for (const line of lines) {
    const frame = FRAME.exec(line);
    if (line.startsWith("Traceback")) kept.push(line);
    else if (frame) {
      inUserFrame = frame[1] === "<exec>";
      if (inUserFrame) kept.push(line);
    } else if (line.startsWith("  ")) {
      if (inUserFrame) kept.push(line);
    } else kept.push(line);
  }
  return kept.join("\n");
}

export function toRunResult({ out, err, value, error, notes = [] }) {
  const loaded = notes.map((name) => `(loaded ${name})\n`).join("");
  if (!error) {
    const shown = value === null || value === undefined ? "" : `=> ${value}\n`;
    return { ok: true, stdout: `${loaded}${out}${shown}`, stderr: err, diagnostics: [] };
  }
  if (!error.startsWith("Traceback")) {
    return { ok: false, stdout: `${loaded}${out}`, stderr: [err.trimEnd(), error].filter(Boolean).join("\n"), diagnostics: [] };
  }
  const traceback = cleanTraceback(error);
  const last = traceback.split("\n").at(-1);
  if (SYNTAX.test(last)) {
    const lineNumbers = [...traceback.matchAll(/File "<exec>", line (\d+)/g)];
    const line = Number(lineNumbers.at(-1)?.[1] ?? 0);
    return {
      ok: false,
      stdout: `${loaded}${out}`,
      stderr: err,
      diagnostics: [{ id: "python", message: last, severity: "Error", line, col: 0, start: 0, end: 0 }],
    };
  }
  return { ok: false, stdout: `${loaded}${out}`, stderr: [err.trimEnd(), traceback].filter(Boolean).join("\n"), diagnostics: [] };
}
