import { cp, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/**
 * Copy one pinned npm runtime into dist, minus excluded top-level entries
 * (unused locales, and any file that imports unpinned remote code).
 * Refuses to vendor if the installed version is not the pinned one.
 */
export async function vendorRuntime(nodeModulesDir, distDir, spec) {
  const source = join(nodeModulesDir, spec.package);
  const installed = JSON.parse(await readFile(join(source, "package.json"), "utf8")).version;
  if (installed !== spec.version) {
    throw new Error(`${spec.package} is installed at ${installed} but pinned to ${spec.version}`);
  }
  const excluded = new Set(spec.exclude ?? []);
  const target = join(distDir, spec.vendorDir);
  await cp(source, target, {
    recursive: true,
    filter: (from) => {
      const top = relative(source, from).split(sep)[0];
      return !excluded.has(top);
    },
  });
  const entries = await readdir(target, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(target, join(entry.parentPath, entry.name)).split(sep).join("/"));
}
