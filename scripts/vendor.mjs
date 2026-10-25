import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { splitFile } from "./parts.mjs";

/**
 * Copy one pinned npm runtime into dist, minus excluded top-level entries
 * (unused locales, and any file that imports unpinned remote code), or only
 * the `include`d ones. Files listed in `split` are cut into parts with a
 * `<file>.json` descriptor. Refuses to vendor if the installed version is not
 * the pinned one.
 */
export async function vendorRuntime(nodeModulesDir, distDir, spec) {
  const source = join(nodeModulesDir, spec.package);
  const installed = JSON.parse(await readFile(join(source, "package.json"), "utf8")).version;
  if (installed !== spec.version) {
    throw new Error(`${spec.package} is installed at ${installed} but pinned to ${spec.version}`);
  }
  const excluded = new Set(spec.exclude ?? []);
  const included = spec.include ? new Set(spec.include) : null;
  const target = join(distDir, spec.vendorDir);
  await cp(source, target, {
    recursive: true,
    filter: (from) => {
      const top = relative(source, from).split(sep)[0];
      if (top === "") return true;
      return included ? included.has(top) : !excluded.has(top);
    },
  });
  for (const file of spec.split ?? []) {
    const descriptor = await splitFile(join(target, file), spec.partBytes);
    await writeFile(join(target, `${file}.json`), `${JSON.stringify(descriptor, null, 2)}\n`);
  }
  const entries = await readdir(target, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(target, join(entry.parentPath, entry.name)).split(sep).join("/"));
}
