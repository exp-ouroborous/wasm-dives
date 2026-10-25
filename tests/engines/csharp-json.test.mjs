import test from "node:test";
import { runCSharpEngine, sdk } from "./csharp-host.mjs";
import { CASES, checkCase } from "./json-contract.mjs";

test("c# json engine", { skip: sdk ? false : "needs the .NET SDK", timeout: 300_000 }, async (t) => {
  const outputs = await runCSharpEngine("json", CASES.map((c) => c.input));
  for (const [i, testCase] of CASES.entries()) await t.test(testCase.name, () => checkCase("csharp", testCase, async () => outputs[i]));
});
