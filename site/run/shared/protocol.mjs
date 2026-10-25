// Messages between a card page (parent) and a sandbox runner (iframe).
// Both sides drop anything that fails these checks, silently.

export const PROTOCOL = "wasm-dives/1";

export const ALLOWED_PARENT_ORIGINS = Object.freeze([
  "https://wordsfortheunwise.com",
  "https://www.wordsfortheunwise.com",
  "https://wasm-dives.pages.dev",
  "http://localhost:8788",
]);

export function isAllowedOrigin(origin, allowed = ALLOWED_PARENT_ORIGINS) {
  return allowed.includes(origin);
}

const DIALECTS = new Set(["c", "cpp"]);

/** Run options are optional; when present, only a known dialect is allowed. */
function validOptions(options) {
  if (options === undefined) return true;
  if (options === null || typeof options !== "object" || Array.isArray(options)) return false;
  const keys = Object.keys(options);
  return keys.length === 1 && keys[0] === "dialect" && DIALECTS.has(options.dialect);
}

const ENGINES = new Set(["regex"]);
const MAX_INPUT_CHARS = 1_000_000;

/** Engine inputs are flat: strings and arrays of strings, at most 1 MB as JSON. */
function validInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
  for (const value of Object.values(input)) {
    const ok = typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"));
    if (!ok) return false;
  }
  return JSON.stringify(input).length <= MAX_INPUT_CHARS;
}

const PARENT_TYPES = {
  run: (m) => typeof m.id === "string" && typeof m.source === "string" && validOptions(m.options),
  call: (m) => typeof m.id === "string" && ENGINES.has(m.engine) && validInput(m.input),
  stop: () => true,
};

/** A parent -> runner message, or null if it is not one. */
export function parseMessage(data) {
  if (data === null || typeof data !== "object" || data.protocol !== PROTOCOL) return null;
  const valid = Object.hasOwn(PARENT_TYPES, data.type) && PARENT_TYPES[data.type](data);
  return valid ? data : null;
}
