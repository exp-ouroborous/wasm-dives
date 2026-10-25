import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import * as shim from "@bjorn3/browser_wasi_shim";
import { MIRI_FILE, runMiri, sysrootTree } from "../site/run/rust/miri.mjs";
import { toRunResult } from "../site/run/rust/rust-result.mjs";

// Real Miri, from the pinned files the build vendors (cached by hash in
// .cache/pinned/ once `npm run build` has run), through the worker's own code.
const runtimes = JSON.parse(await readFile(new URL("../runtimes.json", import.meta.url), "utf8"));
let miri = null;
let sysroot = null;
try {
  const files = new Map();
  for (const file of runtimes.rust.pinned.files) {
    files.set(file.path.replace(/\.gz$/, ""), new Uint8Array(gunzipSync(await readFile(new URL(`../.cache/pinned/${file.sha256}`, import.meta.url)))));
  }
  miri = await WebAssembly.compile(files.get(MIRI_FILE));
  sysroot = sysrootTree(shim, files);
} catch {
  // not cached yet
}
const skip = miri ? false : "run npm run build first (caches the pinned Miri files)";
const run = async (source) => toRunResult(await runMiri(shim, miri, sysroot, source));

test("Miri runs a program and prints its output", { skip }, async () => {
  const result = await run('fn main() { let v: Vec<u64> = (1..=10).map(|x| x * x).collect(); println!("sum = {}", v.iter().sum::<u64>()); }');
  assert.deepEqual(result, { ok: true, stdout: "sum = 385\n", stderr: "", diagnostics: [] });
});

test("a compile error comes back as rustc's positioned diagnostic", { skip }, async () => {
  const result = await run('fn main() { let s: i32 = "a"; }');
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].line, 1);
  assert.match(result.diagnostics[0].message, /^error\[E0308\]: mismatched types/);
});

test("a panic reports its message and ends the run", { skip }, async () => {
  const result = await run('fn main() { println!("before"); let v = vec![1]; println!("{}", v[5]); }');
  assert.equal(result.ok, false);
  assert.equal(result.stdout, "before\n");
  assert.match(result.stderr, /^thread 'main' panicked at main\.rs:1:\d+:\nindex out of bounds: the len is 1 but the index is 5$/);
});

test("each run starts clean: nothing leaks from the previous program", { skip }, async () => {
  await run('fn main() { println!("first"); }');
  const second = await run('fn main() { println!("second"); }');
  assert.equal(second.stdout, "second\n");
});

test("the version the card shows is the one the std rlibs were built with", { skip }, async () => {
  const { RUST_VERSION, SYSROOT_LIB } = await import("../site/run/rust/miri.mjs");
  const core = runtimes.rust.pinned.files.find((f) => f.path.startsWith(`${SYSROOT_LIB}libcore-`));
  const text = new TextDecoder("latin1").decode(gunzipSync(await readFile(new URL(`../.cache/pinned/${core.sha256}`, import.meta.url))));
  const built = /rustc version (\d+\.\d+\.\d+-\w+)/.exec(text)[1];
  assert.ok(RUST_VERSION.startsWith(`Rust ${built} `), `${RUST_VERSION} vs ${built}`);
});

test("every program the card offers runs cleanly under Miri", { skip }, async () => {
  const programs = await import("../site/cards/rust/programs.mjs");
  const expected = [
    [programs.SCRATCHPAD_DEFAULT, /Hello from Rust[\s\S]*Rect \{ w: 2\.0, h: 3\.0 \} has area 6\.00[\s\S]*repeated letters: \[\('b', 2\), \('e', 2\), \('s', 2\)\]/],
    [programs.EXPERIMENTS[0].source, /borrowed ferris, still own ferris\nlongest: ferris\n"1, 2, 3" sums to 6\n"4, five, 6" failed: invalid digit found in string\n/],
    [programs.EXPERIMENTS[1].source, /Ferris says click\na cat with 9 lives says meow\nFERRIS SAYS CLICK\neven squares \[4, 16, 36, 64\] sum to 120\n/],
    [programs.PROBE_SOURCE, /Target Miri pretends to be: x86_64 on linux\nusize: 64 bits, pointer: 8 bytes\n100k-iteration loop: \d+ ms \(sum 4999950000\)\n/],
  ];
  for (const [source, output] of expected) {
    const result = await run(source);
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout, output);
  }
});
