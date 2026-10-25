import test from "node:test";
import assert from "node:assert/strict";
import { initialState, runnerReducer, chooseLoadStrategy } from "../site/run/shared/runner-state.mjs";

const at = (phase, extra = {}) => ({ ...initialState, phase, ...extra });

test("run-requested from idle starts downloading and remembers the run", () => {
  assert.deepEqual(runnerReducer(initialState, { type: "run-requested", id: "r1" }), at("downloading", { pendingRunId: "r1" }));
});

test("run-requested once booted goes straight to running", () => {
  assert.equal(runnerReducer(at("ready"), { type: "run-requested", id: "r2" }).phase, "running");
});

test("downloads reaching the total move to starting", () => {
  const s = runnerReducer(at("downloading", { pendingRunId: "r1" }), { type: "download-progress", loaded: 10, total: 10 });
  assert.equal(s.phase, "starting");
});

test("booted with a pending run is running; without one is ready", () => {
  assert.equal(runnerReducer(at("starting", { pendingRunId: "r1" }), { type: "booted" }).phase, "running");
  assert.equal(runnerReducer(at("starting"), { type: "booted" }).phase, "ready");
});

test("a result returns to ready and clears the pending run", () => {
  assert.deepEqual(runnerReducer(at("running", { pendingRunId: "r1" }), { type: "result", id: "r1" }), at("ready"));
});

for (const phase of ["downloading", "starting", "running"]) {
  test(`stop-requested while ${phase} returns to idle`, () => {
    assert.deepEqual(runnerReducer(at(phase, { pendingRunId: "r1" }), { type: "stop-requested" }), initialState);
  });
}

test("download-failed returns to idle with a retry message", () => {
  assert.deepEqual(
    runnerReducer(at("downloading", { pendingRunId: "r1" }), { type: "download-failed" }),
    at("idle", { error: "Download failed — press Run to retry" }),
  );
});

test("a new run clears a previous download error", () => {
  const s = runnerReducer(at("idle", { error: "Download failed — press Run to retry" }), { type: "run-requested", id: "r3" });
  assert.equal(s.error, null);
});

test("chooseLoadStrategy falls back to direct without service workers", () => {
  assert.equal(chooseLoadStrategy({ hasServiceWorker: false }), "direct");
  assert.equal(chooseLoadStrategy({ hasServiceWorker: true }), "service-worker");
});

test("boot-failed returns to idle with a retry message", () => {
  assert.deepEqual(
    runnerReducer(at("starting", { pendingRunId: "r1" }), { type: "boot-failed" }),
    at("idle", { error: "The runtime failed to start — press Run to retry" }),
  );
});
