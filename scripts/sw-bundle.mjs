/**
 * Module service workers are not reliable across browsers, so the shipped
 * sw.js is classic: sw-core's exports become plain declarations, followed by
 * the wiring.
 */
export function classicServiceWorker(core, wiring) {
  if (/^\s*import\s/m.test(core)) throw new Error("sw-core.mjs must not import anything");
  return `${core.replace(/^export\s+/gm, "")}\n${wiring}`;
}
