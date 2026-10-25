import test from "node:test";
import assert from "node:assert/strict";
import { startRunnerHost } from "../site/run/shared/runner-host.mjs";

const PARENT_ORIGIN = "https://wordsfortheunwise.com";
const PROTOCOL = "wasm-dives/1";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

function harness() {
  const parentMessages = [];
  const parent = { postMessage: (data) => parentMessages.push(data) };
  const win = Object.assign(new EventTarget(), { parent });
  const workers = [];
  const control = deferred();
  startRunnerHost({
    language: "csharp",
    workerUrl: "worker.js",
    win,
    deps: {
      controlled: control.promise,
      total: Promise.resolve(100),
      createWorker: () => {
        const worker = Object.assign(new EventTarget(), {
          posted: [],
          terminated: false,
          postMessage(message) { this.posted.push(message); },
          terminate() { this.terminated = true; },
        });
        workers.push(worker);
        return worker;
      },
      progressChannel: new EventTarget(),
    },
  });
  const send = (data) => {
    const event = new Event("message");
    Object.assign(event, { data: { protocol: PROTOCOL, ...data }, origin: PARENT_ORIGIN, source: parent });
    win.dispatchEvent(event);
  };
  const fromWorker = (worker, data) => {
    const event = new Event("message");
    Object.assign(event, { data });
    worker.dispatchEvent(event);
  };
  return { send, fromWorker, workers, parentMessages, control };
}

test("Stop while the runtime is still being prepared means the program never runs", async () => {
  const { send, workers, control } = harness();
  send({ type: "run", id: "r1", source: "while(true){}" });
  await tick();
  send({ type: "stop" });
  control.resolve(true);
  await tick();
  await tick();
  assert.equal(workers.length, 0);
});

test("a second Run after an early Stop starts exactly one worker", async () => {
  const { send, workers, control } = harness();
  send({ type: "run", id: "r1", source: "a" });
  await tick();
  send({ type: "stop" });
  send({ type: "run", id: "r2", source: "b" });
  control.resolve(true);
  await tick();
  await tick();
  assert.equal(workers.length, 1);
  assert.deepEqual(workers[0].posted, [{ type: "run", id: "r2", source: "b" }]);
});

test("a runtime that fails to boot reports an error and allows a retry", async () => {
  const { send, fromWorker, workers, parentMessages, control } = harness();
  control.resolve(true);
  send({ type: "run", id: "r1", source: "x" });
  await tick();
  await tick();
  fromWorker(workers[0], { type: "boot-failed", message: "network error" });
  assert.equal(workers[0].terminated, true);
  const error = parentMessages.find((m) => m.type === "error");
  assert.equal(error.id, "r1");
  assert.match(error.message, /failed to start.*Run to retry/);
  send({ type: "run", id: "r2", source: "y" });
  await tick();
  await tick();
  assert.equal(workers.length, 2);
});

test("the runner host forwards run options to the worker", async () => {
  const { send, workers, control } = harness();
  control.resolve(true);
  send({ type: "run", id: "r1", source: "x", options: { dialect: "c" } });
  await tick();
  await tick();
  assert.deepEqual(workers[0].posted, [{ type: "run", id: "r1", source: "x", options: { dialect: "c" } }]);
});

test("the runner host forwards engine calls and relays the reply", async () => {
  const { send, fromWorker, workers, parentMessages, control } = harness();
  control.resolve(true);
  send({ type: "call", id: "c1", engine: "regex", input: { pattern: "a", text: "a" } });
  await tick();
  await tick();
  assert.deepEqual(workers[0].posted, [{ type: "call", id: "c1", engine: "regex", input: { pattern: "a", text: "a" } }]);
  fromWorker(workers[0], { type: "called", id: "c1", ok: true, output: { match_count: 1 }, ms: 1 });
  assert.ok(parentMessages.some((m) => m.type === "called" && m.id === "c1" && m.output.match_count === 1));
});

test("a call the runner refuses gets an error reply instead of silence", async () => {
  const { send, workers, parentMessages, control } = harness();
  control.resolve(true);
  send({ type: "call", id: "c9", engine: "no-such-engine", input: {} });
  await tick();
  assert.equal(workers.length, 0, "no worker is started for it");
  assert.deepEqual(parentMessages.find((m) => m.type === "called"), { protocol: PROTOCOL, type: "called", id: "c9", ok: false, output: null, error: "unknown engine: no-such-engine", ms: 0 });
});

test("a run the runner refuses gets a failed result instead of silence", async () => {
  const { send, workers, parentMessages, control } = harness();
  control.resolve(true);
  send({ type: "run", id: "r9", source: "x", options: { dialect: "cobol" } });
  await tick();
  assert.equal(workers.length, 0, "no worker is started for it");
  assert.deepEqual(parentMessages.find((m) => m.type === "result"), { protocol: PROTOCOL, type: "result", id: "r9", ok: false, stdout: "", stderr: "The runner refused this run: invalid run options", diagnostics: [], ms: 0 });
});
