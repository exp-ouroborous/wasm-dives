import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pickerKeyReducer } from "../site/cards/wasm-assets/language-picker.mjs";
import { numberLines } from "../site/cards/wasm-assets/source-viewer.mjs";
import { latestOnly, sourcePath } from "../site/cards/wasm-assets/tool-engine.mjs";

const OPTIONS = ["python", "csharp", "go", "cpp"];

test("pickerKeyReducer opens on ArrowDown/Enter, moves within bounds, selects on Enter, closes on Escape", () => {
  let state = { open: false, active: 1, selected: 1 };
  state = pickerKeyReducer(state, "ArrowDown", OPTIONS.length);
  assert.deepEqual(state, { open: true, active: 1, selected: 1 });
  state = pickerKeyReducer(state, "ArrowDown", OPTIONS.length);
  assert.equal(state.active, 2);
  state = pickerKeyReducer(pickerKeyReducer(state, "ArrowDown", 4), "ArrowDown", 4);
  assert.equal(state.active, 3);
  assert.equal(pickerKeyReducer({ open: true, active: 0, selected: 0 }, "ArrowUp", 4).active, 0);
  state = pickerKeyReducer(state, "Enter", 4);
  assert.deepEqual(state, { open: false, active: 3, selected: 3 });
  assert.deepEqual(pickerKeyReducer({ open: true, active: 2, selected: 0 }, "Escape", 4), { open: false, active: 0, selected: 0 });
});

test("numberLines pads line numbers to the widest one", () => {
  assert.deepEqual(numberLines("a\nb"), [["1", "a"], ["2", "b"]]);
  const many = numberLines(Array.from({ length: 10 }, (_, i) => `l${i}`).join("\n"));
  assert.deepEqual(many[0], [" 1", "l0"]);
  assert.deepEqual(many[9], ["10", "l9"]);
});

test("sourcePath points at each language's published engine source", () => {
  assert.equal(sourcePath("python", "regex"), "../wasm-assets/engines/python/regex.py");
  assert.equal(sourcePath("csharp", "regex"), "../wasm-assets/engines/csharp/regex.cs");
  assert.equal(sourcePath("go", "regex"), "../wasm-assets/engines/go/regex.go");
  assert.equal(sourcePath("cpp", "regex"), "../wasm-assets/engines/cpp/regex.cc");
});

test("latestOnly drops a result that a newer request has overtaken", async () => {
  const resolvers = [];
  const guarded = latestOnly(() => new Promise((resolve) => resolvers.push(resolve)));
  const first = guarded();
  const second = guarded();
  resolvers[1]("second");
  resolvers[0]("first");
  assert.equal(await second, "second");
  await assert.rejects(first, /superseded/);
});

test("tool shell modules never write HTML from strings", async () => {
  for (const file of ["language-picker.mjs", "source-viewer.mjs", "tool-engine.mjs"]) {
    const text = await readFile(new URL(`../site/cards/wasm-assets/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /innerHTML|outerHTML|insertAdjacentHTML/, file);
  }
});
