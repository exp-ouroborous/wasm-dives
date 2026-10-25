// Runs a C# engine source with the local .NET SDK as a file-based app (the
// same source the browser compiles with Roslyn), one JSON input per line.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

export const sdk = (() => {
  try {
    execFileSync("dotnet", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

export async function runCSharpEngine(name, inputs) {
  const dir = await mkdtemp(join(tmpdir(), "csharp-engine-"));
  const file = join(dir, `${name}-engine.cs`);
  const engine = await readFile(new URL(`../../site/run/csharp/engines/${name}.cs`, import.meta.url), "utf8");
  await writeFile(file, `${engine}\n${HARNESS}`);
  const stdout = execFileSync("dotnet", ["run", file], { input: inputs.map((i) => JSON.stringify(i)).join("\n") + "\n", encoding: "utf8" });
  // `dotnet run` may print build messages first; the engine's lines are JSON objects.
  return stdout.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
}
