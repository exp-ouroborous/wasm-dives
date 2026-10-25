import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CASES, checkCase } from "./regex-contract.mjs";

// Runs the engine source with the local .NET SDK as a file-based app (the
// same source the browser compiles with Roslyn). Skips without the SDK.
const HARNESS = `
public static class Harness
{
    public static void Main()
    {
        string? line;
        while ((line = System.Console.ReadLine()) != null) System.Console.WriteLine(Engine.Handle(line));
    }
}
`;

let sdk = true;
try {
  execFileSync("dotnet", ["--version"], { stdio: "ignore" });
} catch {
  sdk = false;
}

test("c# regex engine", { skip: sdk ? false : "needs the .NET SDK", timeout: 300_000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "csharp-engine-"));
  const file = join(dir, "regex-engine.cs");
  const engine = await readFile(new URL("../../site/run/csharp/engines/regex.cs", import.meta.url), "utf8");
  await writeFile(file, `${engine}\n${HARNESS}`);
  const inputs = CASES.map((c) => ({ ...c.input, pattern: c.patterns?.csharp ?? c.input.pattern }));
  const stdout = execFileSync("dotnet", ["run", file], { input: inputs.map((i) => JSON.stringify(i)).join("\n") + "\n", encoding: "utf8" });
  // `dotnet run` may print build messages first; the engine's lines are JSON objects.
  const outputs = stdout.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  for (const [i, testCase] of CASES.entries()) await t.test(testCase.name, () => checkCase("csharp", testCase, async () => outputs[i]));
});
