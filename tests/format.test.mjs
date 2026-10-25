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
