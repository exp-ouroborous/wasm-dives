// C sources compiled in the browser alongside an engine (md4c for Markdown),
// vendored in runtimes/ and copied into dist. Their LICENSE ships for
// attribution but is never fetched, so it stays out of the manifest group.
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function copyLibraries(root, dist, libraries) {
  const paths = [];
  for (const library of libraries) {
    await mkdir(join(dist, library.to), { recursive: true });
    for (const file of [...library.files, library.license]) await cp(join(root, library.from, file), join(dist, library.to, file));
    paths.push(...library.files.map((file) => `${library.to}/${file}`));
  }
  return paths;
}
