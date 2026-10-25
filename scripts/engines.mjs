// Tool engine sources are published twice: under /run/<lang>/engines/ for the
// sandbox to load, and under /cards/wasm-assets/engines/<lang>/ so tool pages
// (proxied onto wordsfortheunwise.com) can show them in "View source".

import { cp, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function publishEngineSources(siteDir, distDir) {
  const published = [];
  for (const language of await readdir(join(siteDir, "run"))) {
    const engines = join(siteDir, "run", language, "engines");
    let files;
    try {
      files = await readdir(engines);
    } catch {
      continue;
    }
    for (const file of files) {
      const target = `cards/wasm-assets/engines/${language}/${file}`;
      await cp(join(engines, file), join(distDir, target));
      published.push(target);
    }
  }
  return published;
}
