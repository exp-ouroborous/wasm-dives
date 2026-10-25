import test from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL, isAllowedOrigin, parseMessage, rejectedCall } from "../site/run/shared/protocol.mjs";

test("isAllowedOrigin accepts the site's own origins", () => {
  assert.equal(isAllowedOrigin("https://wordsfortheunwise.com"), true);
  assert.equal(isAllowedOrigin("https://www.wordsfortheunwise.com"), true);
  assert.equal(isAllowedOrigin("https://wasm-dives.pages.dev"), true);
});

test("isAllowedOrigin rejects other and opaque origins", () => {
  assert.equal(isAllowedOrigin("https://evil.example"), false);
  assert.equal(isAllowedOrigin("https://wordsfortheunwise.com.evil.example"), false);
  assert.equal(isAllowedOrigin("null"), false);
});

test("parseMessage accepts a well-formed run message", () => {
  const message = { protocol: PROTOCOL, type: "run", id: "1", source: "x" };
  assert.deepEqual(parseMessage(message), message);
});

test("parseMessage rejects messages without the protocol tag, non-objects and unknown types", () => {
  assert.equal(parseMessage({ type: "run", id: "1", source: "x" }), null);
  assert.equal(parseMessage("run"), null);
  assert.equal(parseMessage(null), null);
  assert.equal(parseMessage({ protocol: PROTOCOL, type: "eval" }), null);
});

test("parseMessage rejects a run whose id or source is not a string", () => {
  assert.equal(parseMessage({ protocol: PROTOCOL, type: "run", id: 1, source: "x" }), null);
  assert.equal(parseMessage({ protocol: PROTOCOL, type: "run", id: "1", source: {} }), null);
});

test("parseMessage accepts a run with a known dialect option", () => {
  const message = { protocol: PROTOCOL, type: "run", id: "1", source: "x", options: { dialect: "c" } };
  assert.deepEqual(parseMessage(message), message);
  assert.deepEqual(parseMessage({ ...message, options: { dialect: "cpp" } }).options, { dialect: "cpp" });
});

test("parseMessage rejects unknown dialects, extra option keys and non-object options", () => {
  const base = { protocol: PROTOCOL, type: "run", id: "1", source: "x" };
  assert.equal(parseMessage({ ...base, options: { dialect: "rust" } }), null);
  assert.equal(parseMessage({ ...base, options: { dialect: "c", extra: 1 } }), null);
  assert.equal(parseMessage({ ...base, options: "c" }), null);
  assert.equal(parseMessage({ ...base, options: null }), null);
});

test("parseMessage accepts an engine call with a known engine and a plain input", () => {
  const message = { protocol: PROTOCOL, type: "call", id: "1", engine: "regex", input: { pattern: "a", text: "abc", flags: ["ignorecase"], replacement: "" } };
  assert.deepEqual(parseMessage(message), message);
});

test("parseMessage rejects calls to unknown engines, non-object inputs and oversized inputs", () => {
  const base = { protocol: PROTOCOL, type: "call", id: "1", engine: "regex" };
  assert.equal(parseMessage({ ...base, engine: "shell", input: {} }), null);
  assert.equal(parseMessage({ ...base, input: "x" }), null);
  assert.equal(parseMessage({ ...base, input: { nested: { deep: 1 } } }), null);
  assert.equal(parseMessage({ ...base, input: { text: "x".repeat(1_000_001) } }), null);
});

test("engine inputs may also carry booleans and finite numbers", () => {
  const message = { protocol: PROTOCOL, type: "call", id: "1", engine: "json", input: { action: "format", source: "{}", indent: 2, sort_keys: true, minify: false } };
  assert.deepEqual(parseMessage(message), message);
  assert.equal(parseMessage({ ...message, input: { indent: Infinity } }), null);
  assert.equal(parseMessage({ ...message, input: { nested: [1] } }), null);
});

test("the markdown engine is callable, with its features list and safe flag", () => {
  const message = { protocol: PROTOCOL, type: "call", id: "1", engine: "markdown", input: { source: "# a", features: ["tables"], safe: true } };
  assert.deepEqual(parseMessage(message), message);
});

test("rejectedCall names a well-formed call the runner refuses, so it can answer instead of hanging", () => {
  assert.deepEqual(rejectedCall({ protocol: PROTOCOL, type: "call", id: "7", engine: "shell", input: {} }), { id: "7", error: "unknown engine: shell" });
  assert.deepEqual(rejectedCall({ protocol: PROTOCOL, type: "call", id: "8", engine: "json", input: { x: { nested: 1 } } }), { id: "8", error: "invalid engine input" });
  assert.equal(rejectedCall({ protocol: PROTOCOL, type: "call", engine: "json", input: {} }), null, "no id: nothing to answer");
  assert.equal(rejectedCall({ protocol: "other", type: "call", id: "9" }), null);
  assert.equal(rejectedCall({ protocol: PROTOCOL, type: "call", id: "1", engine: "json", input: {} }), null, "valid calls are not rejected");
});

test("the diff engine is callable with two texts and labels", () => {
  const message = { protocol: PROTOCOL, type: "call", id: "1", engine: "diff", input: { left: "a", right: "b", from_label: "left", to_label: "right" } };
  assert.deepEqual(parseMessage(message), message);
});
