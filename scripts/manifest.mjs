import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function urlPath(distDir, file) {
  return `/${relative(distDir, file).split(sep).join("/")}`;
}

/**
 * The runtime manifest the sandbox service worker verifies downloads against:
 * every file under each group's entries (directories or single files), with
 * its size and an SRI-style sha384, sorted by path so builds are reproducible.
 */
export async function buildManifest(distDir, groups) {
  const manifest = { version: 1, groups: {} };
  for (const [name, prefixes] of Object.entries(groups)) {
    const files = [];
    for (const prefix of prefixes) {
      const entry = join(distDir, prefix);
      const entryFiles = (await stat(entry)).isDirectory() ? await listFiles(entry) : [entry];
      for (const file of entryFiles) {
        const bytes = await readFile(file);
        files.push({
          path: urlPath(distDir, file),
          size: bytes.length,
          sha384: `sha384-${createHash("sha384").update(bytes).digest("base64")}`,
        });
      }
    }
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    manifest.groups[name] = { files, totalBytes: files.reduce((n, f) => n + f.size, 0) };
  }
  return manifest;
}

/** Cloudflare Pages rejects any single asset over 25 MiB; fail the build first. */
export async function assertPagesFileLimits(distDir, maxBytes = 25 * 1024 * 1024) {
  for (const file of (await listFiles(distDir)).sort()) {
    const { size } = await stat(file);
    if (size > maxBytes) {
      throw new Error(`${relative(distDir, file)} is ${size} bytes, over the ${maxBytes}-byte Pages limit`);
    }
  }
}
