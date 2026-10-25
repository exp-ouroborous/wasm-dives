import test from "node:test";
import { cppEngine } from "./cpp-host.mjs";
import { CASES, checkCase } from "./diff-contract.mjs";

const diff = await cppEngine("diff");
for (const testCase of CASES) test(`c++ diff: ${testCase.name}`, () => checkCase("cpp", testCase, diff));

// A hand-written algorithm gets more than the shared cases: random inputs
// with many repeated lines must still give valid diffs, and Myers' diff is
// minimal, so its unchanged lines are a longest common subsequence.
function lcsLength(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  return dp[a.length][b.length];
}

test("c++ diff: 300 random inputs give valid, minimal diffs", async () => {
  let seed = 42;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const lines = (n) => Array.from({ length: n }, () => "abcd"[Math.floor(random() * 4)]);
  for (let round = 0; round < 300; round++) {
    const left = lines(Math.floor(random() * 13));
    const right = lines(Math.floor(random() * 13));
    const input = { left: left.join("\n"), right: right.join("\n"), from_label: "left", to_label: "right" };
    const testCase = { name: `random ${round}: ${JSON.stringify([left.join(""), right.join("")])}`, input, expect: {} };
    await checkCase("cpp", testCase, async () => diff(input));
    const output = await diff(input);
    const unchanged = output.rows.filter((r) => r.kind === "equal").length;
    if (unchanged !== lcsLength(left, right)) throw new Error(`${testCase.name}: ${unchanged} unchanged lines, LCS is ${lcsLength(left, right)}`);
  }
});
