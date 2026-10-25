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

const PARENT_TYPES = {
  run: (m) => typeof m.id === "string" && typeof m.source === "string",
  stop: () => true,
};

/** A parent -> runner message, or null if it is not one. */
export function parseMessage(data) {
  if (data === null || typeof data !== "object" || data.protocol !== PROTOCOL) return null;
  const valid = Object.hasOwn(PARENT_TYPES, data.type) && PARENT_TYPES[data.type](data);
  return valid ? data : null;
}
