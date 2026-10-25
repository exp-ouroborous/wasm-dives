// Pure-Python wheels the Pyodide lock file does not carry, pinned by their
// PyPI SHA-256. Downloaded once into .cache/wheels, then copied into dist,
// where the manifest's SHA-384 covers them like any other runtime file.
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function fetchWheel(wheel, cacheDir, fetchImpl = fetch) {
  const path = join(cacheDir, wheel.file);
  try {
    if (sha256(await readFile(path)) === wheel.sha256) return path;
  } catch {
    // not cached yet
  }
  const response = await fetchImpl(wheel.url);
  if (!response.ok) throw new Error(`${wheel.file}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== wheel.sha256) throw new Error(`${wheel.file}: SHA-256 mismatch (expected ${wheel.sha256}, got ${actual})`);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path, bytes);
  return path;
}

// Copies each wheel to <distDir>/<wheelsDir>/ and returns their dist-relative paths.
export async function vendorWheels(root, distDir, wheelsDir, wheels) {
  const paths = [];
  for (const wheel of wheels) {
    const cached = await fetchWheel(wheel, join(root, ".cache/wheels"));
    await mkdir(join(distDir, wheelsDir), { recursive: true });
    await cp(cached, join(distDir, wheelsDir, wheel.file));
    paths.push(`${wheelsDir}/${wheel.file}`);
  }
  return paths;
}
