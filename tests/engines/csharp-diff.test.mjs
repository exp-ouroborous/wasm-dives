import test from "node:test";
import { runCSharpEngine, sdk } from "./csharp-host.mjs";
import { CASES, checkCase } from "./diff-contract.mjs";

test("c# diff engine", { skip: sdk ? false : "needs the .NET SDK", timeout: 300_000 }, async (t) => {
  const outputs = await runCSharpEngine("diff", CASES.map((c) => c.input), ["DiffPlex@1.9.0"]);
  for (const [i, testCase] of CASES.entries()) await t.test(testCase.name, () => checkCase("csharp", testCase, async () => outputs[i]));
});
