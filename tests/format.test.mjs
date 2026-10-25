import test from "node:test";
import assert from "node:assert/strict";
import { capOutput, formatBytes, formatDiagnostics, formatProgress } from "../site/cards/wasm-assets/format.mjs";

test("formatBytes uses decimal units with one decimal place", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(999), "999 B");
  assert.equal(formatBytes(1500), "1.5 KB");
  assert.equal(formatBytes(14_600_000), "14.6 MB");
});

test("formatProgress shows loaded over total in the total's unit", () => {
  assert.equal(formatProgress({ loaded: 3_200_000, total: 14_600_000 }), "3.2 / 14.6 MB");
});

test("formatProgress shows only loaded bytes when the total is unknown", () => {
  assert.equal(formatProgress({ loaded: 3_200_000, total: null }), "3.2 MB");
});

test("capOutput truncates past the cap with a marker", () => {
  const out = capOutput("x".repeat(200_001));
  assert.ok(out.endsWith("\n[output truncated]"));
  assert.equal(out.length, 200_000 + 19);
});

test("capOutput leaves short output alone", () => {
  assert.equal(capOutput("hello\n"), "hello\n");
});

test("formatDiagnostics prints one line per diagnostic with its span", () => {
  assert.equal(
    formatDiagnostics([{ id: "CS0103", message: "The name 'WriteLine' does not exist in the current context", severity: "Error", start: 3, end: 12 }]),
    "CS0103 (3–12): The name 'WriteLine' does not exist in the current context",
  );
});

test("formatRunResult trims trailing newlines before the timing line", async () => {
  const { formatRunResult } = await import("../site/cards/wasm-assets/format.mjs");
  assert.equal(
    formatRunResult({ ok: true, stdout: "hello\n", stderr: "", diagnostics: [], ms: 12 }),
    "hello\n\n(12 ms)",
  );
});

test("formatRunResult shows only error diagnostics for a failed compile", async () => {
  const { formatRunResult } = await import("../site/cards/wasm-assets/format.mjs");
  const out = formatRunResult({
    ok: false,
    stdout: "",
    stderr: "",
    ms: 5,
    diagnostics: [
      { id: "CS8021", message: "warn", severity: "Warning", start: 0, end: 0 },
      { id: "CS0103", message: "bad name", severity: "Error", start: 3, end: 12 },
    ],
  });
  assert.equal(out, "CS0103 (3–12): bad name\n\n(5 ms)");
});

test("formatRunResult appends stderr under a label", async () => {
  const { formatRunResult } = await import("../site/cards/wasm-assets/format.mjs");
  assert.equal(
    formatRunResult({ ok: true, stdout: "", stderr: "Unhandled exception\n", diagnostics: [], ms: 1 }),
    "(no output)\n\nstderr:\nUnhandled exception\n\n(1 ms)",
  );
});
