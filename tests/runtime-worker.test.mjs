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
