import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyLibraries } from "../scripts/libraries.mjs";

test("copyLibraries copies vendored sources into dist and lists the fetched ones (not LICENSE)", async () => {
  const root = await mkdtemp(join(tmpdir(), "libs-"));
  const dist = join(root, "dist");
  await mkdir(join(root, "runtimes/lib"), { recursive: true });
  for (const name of ["a.c", "a.h", "LICENSE.md"]) await writeFile(join(root, "runtimes/lib", name), name);
  const paths = await copyLibraries(root, dist, [{ from: "runtimes/lib", to: "run/vendor/lib/1.0", files: ["a.c", "a.h"], license: "LICENSE.md" }]);
  assert.deepEqual(paths, ["run/vendor/lib/1.0/a.c", "run/vendor/lib/1.0/a.h"]);
  assert.equal(await readFile(join(dist, "run/vendor/lib/1.0/a.c"), "utf8"), "a.c");
  assert.equal(await readFile(join(dist, "run/vendor/lib/1.0/LICENSE.md"), "utf8"), "LICENSE.md");
});
