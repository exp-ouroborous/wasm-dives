import test from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL, isAllowedOrigin, parseMessage } from "../site/run/shared/protocol.mjs";

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
