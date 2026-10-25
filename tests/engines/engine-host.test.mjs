import test from "node:test";
import assert from "node:assert/strict";
import { engineArgs, engineResult } from "../../site/run/cpp/engine-host.mjs";

test("engineArgs passes regex inputs as argv in a fixed order, flags comma-joined", () => {
  assert.deepEqual(engineArgs("regex", { pattern: "a", text: "b", replacement: "c", flags: ["ignorecase", "multiline"] }), ["regex", "a", "b", "c", "ignorecase,multiline"]);
  assert.deepEqual(engineArgs("regex", { pattern: "a", text: "b" }), ["regex", "a", "b", "", ""]);
});

test("engineResult parses the engine's JSON, and a trap becomes a rejected-pattern error", () => {
  assert.deepEqual(engineResult("regex", '{"ok":true}', null), { ok: true });
  const trapped = engineResult("regex", "", "RuntimeError: unreachable");
  assert.equal(trapped.ok, false);
  assert.match(trapped.error, /std::regex rejected the pattern/);
  assert.equal(trapped.engine, "C++ std::regex (ECMAScript)");
});
