// The Go card's runtime: Yaegi built from source (runtimes/go) to WebAssembly
// in a pinned Go container, cached per Yaegi version and image digest, then
// split into parts small enough for Cloudflare Pages.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const OUTPUTS = ["yaegi.wasm", "wasm_exec.js", "LICENSE"];

const sri = (bytes) => `sha384-${createHash("sha384").update(bytes).digest("base64")}`;

/** Split a file into <name>.partNN pieces of at most partBytes, removing the original. */
export async function splitFile(path, partBytes) {
  const bytes = await readFile(path);
  const parts = [];
  for (let offset = 0, n = 0; offset < bytes.length; offset += partBytes, n += 1) {
    const name = `${basename(path)}.part${String(n).padStart(2, "0")}`;
    await writeFile(join(dirname(path), name), bytes.subarray(offset, offset + partBytes));
    parts.push(name);
  }
  await rm(path);
  return { size: bytes.length, sha384: sri(bytes), parts };
}

/** Hash of the runner's sources (every file in its folder) plus the build command. */
export async function sourceFingerprint(sourceDir, buildCommand) {
  const hash = createHash("sha256").update(buildCommand);
  for (const name of (await readdir(sourceDir)).sort()) {
    hash.update(`\0${name}\0`).update(await readFile(join(sourceDir, name)));
  }
  return hash.digest("hex");
}

export function yaegiCacheDir(root, spec, fingerprint) {
  const digest = spec.image.split("@sha256:")[1];
  return join(root, ".cache/yaegi", `${spec.version}-${digest.slice(0, 12)}-${fingerprint.slice(0, 12)}`);
}

export function assertDocker(image, run = execFileSync) {
  try {
    run("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: "ignore" });
  } catch {
    throw new Error(`Docker is required to build the Go runtime (pinned image ${image})`);
  }
}

async function cached(dir) {
  try {
    await Promise.all(OUTPUTS.map((name) => access(join(dir, name))));
    return true;
  } catch {
    return false;
  }
}

/** The container command that builds Yaegi's wasm and collects wasm_exec.js and LICENSE. */
function buildScript(spec) {
  return [
    "cp -r /src /tmp/build && cd /tmp/build",
    `GOOS=js GOARCH=wasm go build -mod=readonly -trimpath -ldflags="-s -w" -o /out/yaegi.wasm .`,
    'cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" /out/wasm_exec.js',
    `cp "$(go env GOMODCACHE)/${spec.module}@${spec.version}/LICENSE" /out/LICENSE`,
  ].join(" && ");
}

/** Build (or reuse) Yaegi's wasm, vendor it into dist in parts, and return the manifest entries. */
export async function buildYaegi(root, dist, spec) {
  const script = buildScript(spec);
  // Any change to the runner's source, go.mod/go.sum or the build command is a new cache entry.
  const cache = yaegiCacheDir(root, spec, await sourceFingerprint(join(root, spec.source), `${spec.image}\n${script}`));
  if (!(await cached(cache))) {
    assertDocker(spec.image);
    await mkdir(cache, { recursive: true });
    execFileSync("docker", ["run", "--rm", "-v", `${join(root, spec.source)}:/src:ro`, "-v", `${cache}:/out`, spec.image, "sh", "-c", script], {
      stdio: "inherit",
    });
  }
  const target = join(dist, spec.vendorDir);
  await mkdir(target, { recursive: true });
  for (const name of OUTPUTS) await cp(join(cache, name), join(target, name));
  const descriptor = await splitFile(join(target, "yaegi.wasm"), spec.partBytes);
  await writeFile(join(target, "yaegi.wasm.json"), `${JSON.stringify(descriptor, null, 2)}\n`);
  // LICENSE ships for attribution but is never fetched, so it stays out of the progress total.
  return [...descriptor.parts, "yaegi.wasm.json", "wasm_exec.js"].map((name) => `${spec.vendorDir}/${name}`);
}
