import test from "node:test";
import assert from "node:assert/strict";
import { classicServiceWorker } from "../scripts/sw-bundle.mjs";

test("classicServiceWorker inlines sw-core without module syntax", () => {
  const core = 'export const A = 1;\nexport async function f() {}\nexport class C {}\n';
  const wiring = 'self.addEventListener("fetch", () => f(A));\n';
  const out = classicServiceWorker(core, wiring);
  assert.doesNotMatch(out, /^\s*(export|import)\s/m);
  assert.match(out, /const A = 1;/);
  assert.match(out, /async function f\(\)/);
  assert.ok(out.endsWith(wiring));
});

test("classicServiceWorker refuses a core that imports anything", () => {
  assert.throws(() => classicServiceWorker('import x from "y";\n', ""), /import/);
});
