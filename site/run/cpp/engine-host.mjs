// How the C/C++ worker talks to a compiled tool engine: inputs go in as argv
// (in a fixed order per engine), the engine prints its JSON result. Built
// without exceptions, libc++'s std::regex aborts on a pattern it rejects, so a
// trap during a call means the pattern was refused.

const ARGS = {
  regex: ["pattern", "text", "replacement", "flags"],
};

const ENGINE_NAMES = {
  regex: "C++ std::regex (ECMAScript)",
};

export function engineArgs(name, input) {
  const order = ARGS[name];
  if (!order) throw new Error(`no ${name} engine for C/C++`);
  return [name, ...order.map((key) => (Array.isArray(input[key]) ? input[key].join(",") : (input[key] ?? "")))];
}

export function engineResult(name, stdout, trap) {
  if (trap) {
    return {
      ok: false,
      error: `std::regex rejected the pattern (it aborts on invalid or unsupported syntax): ${trap}`,
      engine: ENGINE_NAMES[name] ?? name,
      match_count: 0,
      matches: [],
      substitution: "",
      full_match: false,
    };
  }
  return JSON.parse(stdout);
}
