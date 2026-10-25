// How the C/C++ worker talks to a compiled tool engine: inputs go in as argv
// (in a fixed order per engine), the engine prints its JSON result. Built
// without exceptions, libc++'s std::regex aborts on a pattern it rejects, so a
// trap during a regex call means the pattern was refused.

const ARGS = {
  regex: ["pattern", "text", "replacement", "flags"],
  json: ["action", "source", "indent", "sort_keys", "minify", "allow_jsonc"],
  markdown: ["source", "features", "safe"],
  diff: ["left", "right", "from_label", "to_label"],
};

const ENGINE_NAMES = {
  regex: "C++ std::regex (ECMAScript)",
  json: "C++ (hand-written parser)",
  markdown: "md4c 0.6.0",
  diff: "C++ (hand-written Myers)",
};

// C libraries an engine is built with, vendored under run/vendor/<dir>/.
export const LIBRARIES = {
  markdown: { dir: "md4c/0.6.0", sources: ["md4c.c", "md4c-html.c", "entity.c"], headers: ["md4c.h", "md4c-html.h", "entity.h"] },
};

// What each engine's result looks like when the call trapped.
const TRAPPED = {
  regex: (trap) => ({
    error: `std::regex rejected the pattern (it aborts on invalid or unsupported syntax): ${trap}`,
    match_count: 0,
    matches: [],
    substitution: "",
    full_match: false,
  }),
  json: (trap) => ({ error: `The engine stopped unexpectedly: ${trap}`, output: "", tree: null, summary: {}, line: null, column: null }),
  markdown: (trap) => ({ error: `The engine stopped unexpectedly: ${trap}`, html: "" }),
  diff: (trap) => ({ error: `The engine stopped unexpectedly: ${trap}`, diff: "", added: 0, removed: 0, changed: 0, context: 0, rows: [] }),
};

function arg(value) {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  return value ?? "";
}

export function engineArgs(name, input) {
  const order = ARGS[name];
  if (!order) throw new Error(`no ${name} engine for C/C++`);
  return [name, ...order.map((key) => arg(input[key]))];
}

export function engineResult(name, stdout, trap) {
  if (trap) return { ok: false, engine: ENGINE_NAMES[name] ?? name, ...(TRAPPED[name] ?? ((t) => ({ error: t })))(trap) };
  return JSON.parse(stdout);
}

// Compiles an engine to wasm with YoWASP clang. A library's C sources are
// compiled on their own first (-std=c++23 cannot apply to C), then linked in.
// readLibrary(path) returns a vendored file's text, path relative to run/vendor/.
export async function compileEngine(runClang, name, source, readLibrary, io) {
  const library = LIBRARIES[name];
  const files = { "engine.cc": source };
  const objects = [];
  if (library) {
    const libraryFiles = {};
    for (const file of [...library.sources, ...library.headers]) libraryFiles[file] = await readLibrary(`${library.dir}/${file}`);
    const compiled = await runClang(["clang", "-c", "-O2", ...library.sources], libraryFiles, io);
    Object.assign(files, libraryFiles);
    for (const file of library.sources) {
      const object = file.replace(/\.c$/, ".o");
      files[object] = compiled[object];
      objects.push(object);
    }
  }
  const linked = await runClang(["clang++", "engine.cc", ...objects, "-std=c++23", "-O2", "-fno-exceptions", "-o", "engine.wasm"], files, io);
  return linked["engine.wasm"];
}
