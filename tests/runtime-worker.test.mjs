import test from "node:test";
import assert from "node:assert/strict";
import { serveRuntime } from "../site/run/shared/runtime-worker.mjs";

function scope() {
  const posted = [];
  const target = new EventTarget();
  const deliver = (data) => {
    const event = new Event("message");
    Object.assign(event, { data });
    target.dispatchEvent(event);
  };
  return { posted, target, deliver, post: (m) => posted.push(m) };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a failed boot is reported instead of left as an unhandled rejection", async () => {
  const { posted, target, post, deliver } = scope();
  serveRuntime({ boot: () => Promise.reject(new Error("fetch failed")), run: async () => ({}), post, target });
  deliver({ type: "run", id: "r1", source: "x" });
  await tick();
  assert.deepEqual(posted, [{ type: "boot-failed", message: "fetch failed" }]);
});

test("a booted runtime announces its version and answers runs", async () => {
  const { posted, target, post, deliver } = scope();
  serveRuntime({
    boot: async () => ({ runtime: "rt", version: "10.0.0" }),
    run: async (runtime, source) => ({ ok: true, stdout: `${runtime}:${source}`, stderr: "", diagnostics: [] }),
    post,
    target,
  });
  deliver({ type: "run", id: "r1", source: "x" });
  await tick();
  await tick();
  assert.deepEqual(posted[0], { type: "booted", version: "10.0.0" });
  assert.equal(posted[1].type, "result");
  assert.equal(posted[1].id, "r1");
  assert.equal(posted[1].stdout, "rt:x");
});

test("an exception while running becomes a failed result, not a crash", async () => {
  const { posted, target, post, deliver } = scope();
  serveRuntime({ boot: async () => ({ runtime: 1, version: "v" }), run: async () => { throw new Error("boom"); }, post, target });
  deliver({ type: "run", id: "r1", source: "x" });
  await tick();
  await tick();
  assert.deepEqual({ ...posted[1], ms: 0 }, { type: "result", id: "r1", ok: false, stdout: "", stderr: "boom", diagnostics: [], ms: 0 });
});

test("run receives the options, or an empty object when none were sent", async () => {
  const { posted, target, post, deliver } = scope();
  const seen = [];
  serveRuntime({ boot: async () => ({ runtime: 1, version: "v" }), run: async (_rt, _src, options) => { seen.push(options); return { ok: true, stdout: "", stderr: "", diagnostics: [] }; }, post, target });
  deliver({ type: "run", id: "a", source: "x", options: { dialect: "c" } });
  await tick(); await tick();
  deliver({ type: "run", id: "b", source: "y" });
  await tick(); await tick();
  assert.deepEqual(seen, [{ dialect: "c" }, {}]);
  assert.equal(posted.length, 3);
});

test("call messages go to the runtime's call handler, and its errors become ok: false", async () => {
  const { posted, target, post, deliver } = scope();
  serveRuntime({
    boot: async () => ({ runtime: "rt", version: "v" }),
    run: async () => ({}),
    call: async (runtime, engine, input) => {
      if (input.fail) throw new Error("engine broke");
      return { engine, echoed: input.text, runtime };
    },
    post,
    target,
  });
  deliver({ type: "call", id: "a", engine: "regex", input: { text: "hi" } });
  await tick(); await tick();
  deliver({ type: "call", id: "b", engine: "regex", input: { fail: true } });
  await tick(); await tick();
  const called = posted.filter((m) => m.type === "called");
  assert.deepEqual({ ...called[0], ms: 0 }, { type: "called", id: "a", ok: true, output: { engine: "regex", echoed: "hi", runtime: "rt" }, error: "", ms: 0 });
  assert.equal(called[1].ok, false);
  assert.equal(called[1].error, "engine broke");
});
