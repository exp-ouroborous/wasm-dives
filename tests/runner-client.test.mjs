import test from "node:test";
import assert from "node:assert/strict";
import { createRunnerClient, runnerOrigin } from "../site/cards/wasm-assets/runner-client.mjs";

const ORIGIN = "https://wasm-dives.pages.dev";
const PROTOCOL = "wasm-dives/1";

function harness() {
  const win = new EventTarget();
  const sent = [];
  const contentWindow = { postMessage: (data, origin) => sent.push({ data, origin }) };
  const iframe = { contentWindow };
  const client = createRunnerClient({ iframe, origin: ORIGIN, win, loaded: Promise.resolve() });
  const deliver = (data, { origin = ORIGIN, source = contentWindow } = {}) => {
    const event = new Event("message");
    Object.assign(event, { data: { protocol: PROTOCOL, ...data }, origin, source });
    win.dispatchEvent(event);
  };
  return { client, sent, deliver, contentWindow };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("runnerOrigin points local dev at the other loopback host", () => {
  assert.equal(runnerOrigin({ hostname: "localhost", port: "8788" }), "http://127.0.0.1:8788");
  assert.equal(runnerOrigin({ hostname: "wordsfortheunwise.com", port: "" }), ORIGIN);
});

test("run posts a tagged run message to the runner origin", async () => {
  const { client, sent } = harness();
  client.run("code");
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].origin, ORIGIN);
  assert.deepEqual({ ...sent[0].data, id: "x" }, { protocol: PROTOCOL, type: "run", id: "x", source: "code" });
});

test("a result from the wrong origin or source does not resolve the run", async () => {
  const { client, sent, deliver } = harness();
  let settled = false;
  client.run("code").then(() => (settled = true), () => (settled = true));
  await tick();
  const { id } = sent[0].data;
  deliver({ type: "result", id, ok: true, stdout: "x" }, { origin: "https://evil.example" });
  deliver({ type: "result", id, ok: true, stdout: "x" }, { source: {} });
  await tick();
  assert.equal(settled, false);
});

test("a result for another id does not resolve the run; the matching one does", async () => {
  const { client, sent, deliver } = harness();
  const pending = client.run("code");
  await tick();
  const { id } = sent[0].data;
  let settled = false;
  pending.then(() => (settled = true));
  deliver({ type: "result", id: "other", ok: true, stdout: "nope" });
  await tick();
  assert.equal(settled, false);
  deliver({ type: "result", id, ok: true, stdout: "hello\n" });
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.stdout, "hello\n");
});

test("stop rejects the pending run and tells the runner", async () => {
  const { client, sent } = harness();
  const pending = client.run("while(true){}");
  await tick();
  client.stop();
  await assert.rejects(pending, /stopped/);
  assert.equal(sent.at(-1).data.type, "stop");
});

test("an error for the pending run rejects it with the runner's message", async () => {
  const { client, sent, deliver } = harness();
  const pending = client.run("code");
  await tick();
  deliver({ type: "error", id: sent[0].data.id, message: "Download failed — press Run to retry" });
  await assert.rejects(pending, /Download failed/);
});

test("phase, progress, runtime and notice reach their callbacks", () => {
  const { client, deliver } = harness();
  const seen = [];
  client.onPhase((p) => seen.push(["phase", p]));
  client.onProgress((p) => seen.push(["progress", p]));
  client.onRuntime((r) => seen.push(["runtime", r]));
  client.onNotice((n) => seen.push(["notice", n]));
  deliver({ type: "phase", phase: "downloading" });
  deliver({ type: "progress", loaded: 1, total: 2 });
  deliver({ type: "runtime", language: "csharp", version: "10.0.0" });
  deliver({ type: "notice", message: "m" });
  assert.deepEqual(seen, [
    ["phase", "downloading"],
    ["progress", { loaded: 1, total: 2 }],
    ["runtime", { language: "csharp", version: "10.0.0" }],
    ["notice", "m"],
  ]);
});

test("run forwards options when given and omits them otherwise", async () => {
  const { client, sent } = harness();
  client.run("x", { dialect: "c" }).catch(() => {});
  await tick();
  assert.deepEqual(sent[0].data.options, { dialect: "c" });
  client.stop();
  client.run("y").catch(() => {});
  await tick();
  assert.equal(Object.hasOwn(sent.at(-1).data, "options"), false);
});

test("call posts an engine call and resolves on the matching 'called' reply only", async () => {
  const { client, sent, deliver } = harness();
  const pending = client.call("regex", { pattern: "a", text: "a" });
  await tick();
  const message = sent.at(-1).data;
  assert.deepEqual({ ...message, id: "x" }, { protocol: PROTOCOL, type: "call", id: "x", engine: "regex", input: { pattern: "a", text: "a" } });
  let settled = false;
  pending.then(() => (settled = true));
  deliver({ type: "called", id: "other", ok: true, output: {} });
  await tick();
  assert.equal(settled, false);
  deliver({ type: "called", id: message.id, ok: true, output: { match_count: 1 } });
  assert.deepEqual((await pending).output, { match_count: 1 });
});

test("a 'busy' reply makes the client retry the same call shortly afterwards", async () => {
  const { client, sent, deliver } = harness();
  const pending = client.call("regex", { pattern: "b", text: "b" });
  await tick();
  const first = sent.at(-1).data;
  deliver({ type: "called", id: first.id, ok: false, output: null, error: "busy" });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const retry = sent.at(-1).data;
  assert.equal(retry.type, "call");
  assert.notEqual(retry.id, first.id);
  assert.deepEqual(retry.input, { pattern: "b", text: "b" });
  deliver({ type: "called", id: retry.id, ok: true, output: { match_count: 1 } });
  assert.equal((await pending).ok, true);
});
