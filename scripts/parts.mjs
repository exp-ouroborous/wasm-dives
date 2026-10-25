// Splitting files that exceed Cloudflare Pages' 25 MiB limit into parts.
// The browser reassembles them (site/run/shared/parts.mjs) and checks the
// whole file against the descriptor's SHA-384.

import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

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
