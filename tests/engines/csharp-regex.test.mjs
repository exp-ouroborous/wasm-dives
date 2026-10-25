import test from "node:test";
import { runCSharpEngine, sdk } from "./csharp-host.mjs";
import { CASES, checkCase } from "./regex-contract.mjs";

test("c# regex engine", { skip: sdk ? false : "needs the .NET SDK", timeout: 300_000 }, async (t) => {
  const outputs = await runCSharpEngine("regex", CASES.map((c) => ({ ...c.input, pattern: c.patterns?.csharp ?? c.input.pattern })));
  for (const [i, testCase] of CASES.entries()) await t.test(testCase.name, () => checkCase("csharp", testCase, async () => outputs[i]));
});
