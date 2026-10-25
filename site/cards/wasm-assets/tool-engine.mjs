// Tool pages call a tool engine in the chosen language through that language's
// sandbox runner (one hidden iframe per language, created on first use), so
// tools reuse the language cards' cached runtimes and never run on this origin.

import { createRunnerClient, runnerOrigin } from "./runner-client.mjs";

const EXTENSIONS = { python: "py", csharp: "cs", go: "go", cpp: "cc" };

/** Where the page can read an engine's source (published beside the card assets). */
export function sourcePath(language, engine) {
  return `../wasm-assets/engines/${language}/${engine}.${EXTENSIONS[language]}`;
}

/** Wrap an async function so only the most recent call's result is delivered. */
export function latestOnly(fn) {
  let latest = 0;
  return async (...args) => {
    const mine = ++latest;
    const result = await fn(...args);
    if (mine !== latest) throw new Error("superseded");
    return result;
  };
}

export function createToolEngine({ onStatus = () => {}, doc = document, loc = location } = {}) {
  const origin = runnerOrigin(loc);
  const clients = new Map();

  function clientFor(language) {
    if (!clients.has(language)) {
      const iframe = doc.createElement("iframe");
      iframe.className = "runner-frame";
      iframe.title = `${language} sandbox runner`;
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
      iframe.setAttribute("aria-hidden", "true");
      iframe.tabIndex = -1;
      iframe.src = `${origin}/run/${language}/`;
      doc.body.append(iframe);
      const client = createRunnerClient({ iframe, origin });
      client.onPhase((phase) => onStatus({ language, phase }));
      client.onProgress((progress) => onStatus({ language, progress }));
      client.onRuntime((runtime) => onStatus({ language, runtime }));
      client.onNotice((notice) => onStatus({ language, notice }));
      clients.set(language, client);
    }
    return clients.get(language);
  }

  const call = latestOnly((language, engine, input) => clientFor(language).call(engine, input));

  return {
    call,
    stop(language) {
      clients.get(language)?.stop();
    },
  };
}
