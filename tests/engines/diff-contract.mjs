// Shared assertions for every diff engine. Algorithms differ (difflib vs
// Myers), so every case checks the result is a valid diff of its inputs;
// exact output is pinned only where all algorithms must agree.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export const CASES = JSON.parse(await readFile(new URL("./diff-cases.json", import.meta.url), "utf8"));

export function splitLines(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/;

// Applies a unified diff to the left lines; checks each hunk's ranges and context as it goes.
export function applyUnified(diff, leftLines) {
  const lines = diff.split("\n");
  assert.match(lines[0], /^--- /);
  assert.match(lines[1], /^\+\+\+ /);
  const out = [];
  let cursor = 0;
  let i = 2;
  while (i < lines.length) {
    const header = HUNK.exec(lines[i]);
    assert.ok(header, `hunk header: ${lines[i]}`);
    const [leftStart, leftCount, , rightCount] = [Number(header[1]), header[2] === undefined ? 1 : Number(header[2]), Number(header[3]), header[4] === undefined ? 1 : Number(header[4])];
    const from = leftCount === 0 ? leftStart : leftStart - 1;
    assert.ok(from >= cursor, "hunks are in order");
    out.push(...leftLines.slice(cursor, from));
    cursor = from;
    let seenLeft = 0;
    let seenRight = 0;
    for (i++; i < lines.length && !lines[i].startsWith("@@"); i++) {
      const [mark, text] = [lines[i][0], lines[i].slice(1)];
      if (mark === " " || mark === "-") {
        assert.equal(leftLines[cursor], text, `line ${cursor + 1} matches the left side`);
        cursor++;
        seenLeft++;
      }
      if (mark === " " || mark === "+") {
        out.push(text);
        seenRight++;
      }
      assert.ok(" -+".includes(mark), `diff line: ${lines[i]}`);
    }
    assert.equal(seenLeft, leftCount, `${header[0]} left count`);
    assert.equal(seenRight, rightCount, `${header[0]} right count`);
  }
  out.push(...leftLines.slice(cursor));
  return out;
}

export async function checkCase(language, testCase, diff) {
  const output = await diff(testCase.input);
  assert.match(output.engine ?? "", /\S/, `${testCase.name}: engine name`);
  assert.equal(output.ok, true, `${testCase.name}: ${output.error}`);
  const left = splitLines(testCase.input.left);
  const right = splitLines(testCase.input.right);
  const { rows } = output;

  // Rows rebuild both sides, in order, numbered from 1.
  const leftRows = rows.filter((r) => r.left_line !== null);
  const rightRows = rows.filter((r) => r.right_line !== null);
  assert.deepEqual(leftRows.map((r) => r.left_text), left, `${testCase.name}: rows rebuild the left side`);
  assert.deepEqual(rightRows.map((r) => r.right_text), right, `${testCase.name}: rows rebuild the right side`);
  assert.deepEqual(leftRows.map((r) => r.left_line), left.map((_, i) => i + 1));
  assert.deepEqual(rightRows.map((r) => r.right_line), right.map((_, i) => i + 1));
  for (const row of rows) {
    const sides = `${row.left_line !== null ? "L" : ""}${row.right_line !== null ? "R" : ""}`;
    assert.equal(sides, { equal: "LR", replace: "LR", delete: "L", insert: "R" }[row.kind], `${testCase.name}: ${row.kind} row sides`);
    if (row.kind === "equal") assert.equal(row.left_text, row.right_text);
    if (row.kind === "delete") assert.equal(row.right_text, "");
    if (row.kind === "insert") assert.equal(row.left_text, "");
  }

  // Counts agree with the rows and with the diff.
  const added = rows.filter((r) => r.kind !== "equal" && r.right_line !== null).length;
  const removed = rows.filter((r) => r.kind !== "equal" && r.left_line !== null).length;
  assert.equal(output.added, added, `${testCase.name}: added`);
  assert.equal(output.removed, removed, `${testCase.name}: removed`);
  assert.equal(output.changed, Math.min(added, removed), `${testCase.name}: changed`);
  const body = output.diff ? output.diff.split("\n").slice(2) : [];
  assert.equal(body.filter((l) => l.startsWith("+")).length, added, `${testCase.name}: + lines`);
  assert.equal(body.filter((l) => l.startsWith("-")).length, removed, `${testCase.name}: - lines`);
  assert.equal(output.context, body.filter((l) => l.startsWith(" ")).length, `${testCase.name}: context`);

  // The diff turns the left into the right; empty exactly when nothing changed.
  if (added + removed === 0) assert.equal(output.diff, "", `${testCase.name}: no diff`);
  else assert.deepEqual(applyUnified(output.diff, left), right, `${testCase.name}: diff applies`);

  const expect = testCase.expect;
  if (expect.diff !== undefined) assert.equal(output.diff, expect.diff, testCase.name);
  if (expect.kinds) assert.deepEqual(rows.map((r) => r.kind), expect.kinds, testCase.name);
  if (expect.hunks) assert.deepEqual(output.diff.split("\n").filter((l) => l.startsWith("@@")), expect.hunks, testCase.name);
  for (const key of ["added", "removed", "changed", "context"]) {
    if (expect[key] !== undefined) assert.equal(output[key], expect[key], `${testCase.name}: ${key}`);
  }
}
