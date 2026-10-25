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

test("engineArgs passes json inputs in order, booleans as 1/0 and numbers as text", () => {
  assert.deepEqual(
    engineArgs("json", { action: "format", source: "{}", indent: 4, sort_keys: true, minify: false, allow_jsonc: true }),
    ["json", "format", "{}", "4", "1", "0", "1"],
  );
  assert.deepEqual(engineArgs("json", { action: "analyze", source: "[]" }), ["json", "analyze", "[]", "", "", "", ""]);
});

test("a trap in the json engine is reported as an engine failure, not a regex one", () => {
  const trapped = engineResult("json", "", "RuntimeError: unreachable");
  assert.equal(trapped.ok, false);
  assert.equal(trapped.engine, "C++ (hand-written parser)");
  assert.match(trapped.error, /stopped unexpectedly: RuntimeError: unreachable/);
  assert.doesNotMatch(trapped.error, /regex/);
});
