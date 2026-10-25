import test from "node:test";
import assert from "node:assert/strict";
import { indexManifest, verifySha384, ProgressTracker } from "../site/run/sw-core.mjs";

const ABC_SHA384 = "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn";
const bytes = (s) => new TextEncoder().encode(s).buffer;

test("verifySha384 accepts matching bytes", async () => {
  assert.equal(await verifySha384(bytes("abc"), ABC_SHA384), true);
});

test("verifySha384 rejects a single changed byte", async () => {
  assert.equal(await verifySha384(bytes("abd"), ABC_SHA384), false);
});

test("indexManifest maps every path to its size, hash and group", () => {
  const index = indexManifest({
    version: 1,
    groups: { csharp: { files: [{ path: "/run/a", size: 3, sha384: ABC_SHA384 }], totalBytes: 3 } },
  });
  assert.deepEqual(index.get("/run/a"), { size: 3, sha384: ABC_SHA384, group: "csharp" });
  assert.equal(index.get("/run/b"), undefined);
});

test("ProgressTracker accumulates loaded bytes against the total", () => {
  const tracker = new ProgressTracker(10);
  assert.deepEqual(tracker.add("/a", 4, 4), { loaded: 4, total: 10 });
  assert.deepEqual(tracker.add("/b", 6, 6), { loaded: 10, total: 10 });
});

test("ProgressTracker counts a file's bytes once even when it is fetched again", () => {
  const tracker = new ProgressTracker(10);
  tracker.add("/a", 2, 4);
  tracker.add("/a", 2, 4);
  assert.deepEqual(tracker.add("/a", 4, 4), { loaded: 4, total: 10 });
});

test("ProgressTracker.fail reports the failed path", () => {
  assert.deepEqual(new ProgressTracker(10).fail("/run/x"), { failed: "/run/x" });
});

test("ProgressTracker.complete reports the full total once the runtime has booted", () => {
  const tracker = new ProgressTracker(10);
  tracker.add("/a", 7, 7);
  assert.deepEqual(tracker.complete(), { loaded: 10, total: 10 });
});

test("a runner page load (navigation inside /run/) makes the service worker re-read the manifest", async () => {
  const { refreshesManifest } = await import("../site/run/sw-core.mjs");
  assert.equal(refreshesManifest({ mode: "navigate", url: "https://wasm-dives.pages.dev/run/python/" }), true);
  assert.equal(refreshesManifest({ mode: "cors", url: "https://wasm-dives.pages.dev/run/vendor/x.wasm" }), false);
  assert.equal(refreshesManifest({ mode: "navigate", url: "https://wasm-dives.pages.dev/cards/python/" }), false);
});
