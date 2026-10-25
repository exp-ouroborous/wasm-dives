import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { assertPagesFileLimits, buildManifest } from "./manifest.mjs";
import { vendorRuntime } from "./vendor.mjs";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const runtimes = JSON.parse(await readFile(join(root, "runtimes.json"), "utf8"));

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "site"), dist, { recursive: true });

const groups = {};
for (const [language, spec] of Object.entries(runtimes)) {
  const copied = await vendorRuntime(join(root, "node_modules"), dist, spec);
  if (spec.bundle) {
    // The runtime's JS uses bundler-style asset imports (import url from "./x.wasm"),
    // so bundle its worker in place: assets keep their vendored paths and become
    // relative URLs.
    await build({
      entryPoints: [join(dist, spec.bundle.entry)],
      outbase: join(dist, "run"),
      outdir: join(dist, "run"),
      allowOverwrite: true,
      bundle: true,
      format: "esm",
      target: "es2022",
      assetNames: "[dir]/[name]",
      loader: Object.fromEntries(spec.bundle.loaders.map((ext) => [ext, "file"])),
      // dotnet.js keeps Node-only branches (import("process") etc.) behind
      // ENVIRONMENT_IS_NODE; leave them as never-taken dynamic imports.
      external: ["process", "module", "fs", "path", "url", "crypto", "ws", "worker_threads", "perf_hooks", "node:*"],
      logLevel: "warning",
    });
  }
  groups[language] = spec.bundle ? [spec.vendorDir, spec.bundle.entry] : [spec.vendorDir];
  console.log(`vendored ${spec.package}@${spec.version}: ${copied.length} files`);
}

const manifest = await buildManifest(dist, groups);
await writeFile(join(dist, "run/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
for (const [language, group] of Object.entries(manifest.groups)) {
  console.log(`${language}: ${group.files.length} files, ${(group.totalBytes / 1e6).toFixed(1)} MB unpacked`);
}
await assertPagesFileLimits(dist);
