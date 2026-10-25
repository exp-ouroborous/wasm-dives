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

test("engineArgs passes markdown inputs: source, features comma-joined, safe as 1/0", () => {
  assert.deepEqual(engineArgs("markdown", { source: "# a", features: ["tables", "hard_breaks"], safe: true }), ["markdown", "# a", "tables,hard_breaks", "1"]);
});

test("compileEngine builds a library's C sources first, then links them into the C++ engine", async () => {
  const { compileEngine, LIBRARIES } = await import("../../site/run/cpp/engine-host.mjs");
  const calls = [];
  const runClang = async (args, files) => {
    calls.push({ args, files: Object.keys(files).sort() });
    if (args.includes("-c")) return { ...files, "md4c.o": "o1", "md4c-html.o": "o2", "entity.o": "o3" };
    return { ...files, "engine.wasm": "wasm" };
  };
  const read = async (path) => `contents of ${path}`;
  assert.equal(await compileEngine(runClang, "markdown", "// engine", read), "wasm");
  const { dir, sources, headers } = LIBRARIES.markdown;
  assert.equal(dir, "md4c/0.6.0");
  assert.deepEqual(calls[0].args, ["clang", "-c", "-O2", ...sources]);
  assert.deepEqual(calls[0].files, [...sources, ...headers].sort());
  assert.deepEqual(calls[1].args, ["clang++", "engine.cc", "md4c.o", "md4c-html.o", "entity.o", "-std=c++23", "-O2", "-fno-exceptions", "-o", "engine.wasm"]);
  assert.ok(calls[1].files.includes("md4c-html.h"), "engine compiles against the library headers");
});

test("compileEngine compiles a library-free engine in one step", async () => {
  const { compileEngine } = await import("../../site/run/cpp/engine-host.mjs");
  const calls = [];
  const runClang = async (args, files) => (calls.push(args), { ...files, "engine.wasm": "w" });
  assert.equal(await compileEngine(runClang, "json", "// engine", async () => ""), "w");
  assert.deepEqual(calls, [["clang++", "engine.cc", "-std=c++23", "-O2", "-fno-exceptions", "-o", "engine.wasm"]]);
});

test("engineArgs passes diff inputs: left, right, then the two labels", () => {
  assert.deepEqual(engineArgs("diff", { left: "a", right: "b", from_label: "old", to_label: "new" }), ["diff", "a", "b", "old", "new"]);
});
