import test from "node:test";
import { runCSharpEngine, sdk } from "./csharp-host.mjs";
import { CASES, checkCase } from "./markdown-contract.mjs";

test("c# markdown engine", { skip: sdk ? false : "needs the .NET SDK", timeout: 300_000 }, async (t) => {
  const outputs = await runCSharpEngine("markdown", CASES.map((c) => c.input), ["Markdig@1.4.0"]);
  for (const [i, testCase] of CASES.entries()) await t.test(testCase.name, () => checkCase("csharp", testCase, async () => outputs[i]));
});
