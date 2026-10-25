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
  assert.deepEqual(tracker.add(4), { loaded: 4, total: 10 });
  assert.deepEqual(tracker.add(6), { loaded: 10, total: 10 });
});

test("ProgressTracker.fail reports the failed path", () => {
  assert.deepEqual(new ProgressTracker(10).fail("/run/x"), { failed: "/run/x" });
});
