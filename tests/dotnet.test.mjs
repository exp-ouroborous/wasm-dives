import test from "node:test";
import assert from "node:assert/strict";
import { runtimeId, runtimeModule } from "../scripts/dotnet.mjs";

const files = [
  { path: "dotnet.js", bytes: Buffer.from("js") },
  { path: "System.Private.CoreLib.wasm", bytes: Buffer.from("corelib") },
];

test("runtimeId is a short content hash, independent of file order", () => {
  assert.match(runtimeId(files), /^[0-9a-f]{12}$/);
  assert.equal(runtimeId(files), runtimeId([...files].reverse()));
});

test("runtimeId changes when any file's bytes or path change", () => {
  const id = runtimeId(files);
  assert.notEqual(runtimeId([files[0], { ...files[1], bytes: Buffer.from("corelib!") }]), id);
  assert.notEqual(runtimeId([files[0], { ...files[1], path: "System.Linq.wasm" }]), id);
});

test("runtimeModule re-exports dotnet from the vendored runtime by relative URL", () => {
  assert.match(
    runtimeModule("/dist/run/csharp", "/dist/run/vendor/csharp-runner/abc123/dotnet.js"),
    /export \{ dotnet \} from "\.\.\/vendor\/csharp-runner\/abc123\/dotnet\.js";/,
  );
});
