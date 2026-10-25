// How the C/C++ worker talks to a compiled tool engine: inputs go in as argv
// (in a fixed order per engine), the engine prints its JSON result. Built
// without exceptions, libc++'s std::regex aborts on a pattern it rejects, so a
// trap during a regex call means the pattern was refused.

const ARGS = {
  regex: ["pattern", "text", "replacement", "flags"],
  json: ["action", "source", "indent", "sort_keys", "minify", "allow_jsonc"],
};

const ENGINE_NAMES = {
  regex: "C++ std::regex (ECMAScript)",
  json: "C++ (hand-written parser)",
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
