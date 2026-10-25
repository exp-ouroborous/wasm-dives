// Running one Rust program with Miri, Rust's MIR interpreter compiled to
// WASI. Shared by the worker and the Node tests; the WASI shim is passed in
// (browser_wasi_shim in both).

// Paths inside the vendored folder, without the .gz the files are served as.
export const MIRI_FILE = "bin/miri.opt.1718474653.wasm";
// What this build is (the std rlibs say "rustc version 1.78.0-dev").
export const RUST_VERSION = "Rust 1.78.0-dev (2024) · Miri";
export const SYSROOT_LIB = "lib/rustlib/x86_64-unknown-linux-gnu/lib/";

// rubri's flags: Miri's undefined-behaviour checks are off, so it only runs
// the code (much faster). This std cannot unwind, so a panic aborts: it
// prints its message, then Miri reports the abort and stops.
export const MIRI_ARGS = [
  "miri",
  "--sysroot",
  "/sysroot",
  "main.rs",
  "--target",
  "x86_64-unknown-linux-gnu",
  "-Zmir-opt-level=3",
  "-Zmiri-ignore-leaks",
  "-Zmiri-permissive-provenance",
  "-Zmiri-preemption-rate=0",
  "-Zmiri-disable-alignment-check",
  "-Zmiri-disable-data-race-detector",
  "-Zmiri-disable-stacked-borrows",
  "-Zmiri-disable-validation",
  "-Zmir-emit-retag=false",
  "-Zmiri-disable-isolation",
  "-Zmiri-panic-on-unsupported",
  "-Cpanic=abort",
];

/** The /sysroot tree Miri reads: files maps vendored paths (no .gz) to bytes. */
export function sysrootTree({ PreopenDirectory, Directory, File }, files) {
  const libs = new Map();
  for (const [path, bytes] of files) {
    if (path.startsWith(SYSROOT_LIB)) libs.set(path.slice(SYSROOT_LIB.length), new File(bytes, { readonly: true }));
  }
  const dir = (entries) => new Directory(new Map(entries));
  return new PreopenDirectory("/sysroot", new Map([
    ["lib", dir([["rustlib", dir([
      ["wasm32-wasi", dir([["lib", dir([])]])],
      ["x86_64-unknown-linux-gnu", dir([["lib", new Directory(libs)]])],
    ])]])],
  ]));
}

/** Runs main.rs = source in a fresh Miri instance; returns its output and how it ended. */
export async function runMiri({ WASI, WASIProcExit, File, OpenFile, ConsoleStdout, PreopenDirectory }, miri, sysroot, source) {
  const decoder = (sink) => {
    const textDecoder = new TextDecoder();
    return new ConsoleStdout((bytes) => sink(textDecoder.decode(bytes, { stream: true })));
  };
  let stdout = "";
  let stderr = "";
  const root = new PreopenDirectory("/", new Map([["main.rs", new File(new TextEncoder().encode(source))]]));
  const fds = [
    new OpenFile(new File([])),
    decoder((text) => (stdout += text)),
    decoder((text) => (stderr += text)),
    new PreopenDirectory("/tmp", new Map()),
    sysroot,
    root,
  ];
  const wasi = new WASI(MIRI_ARGS, [], fds, { debug: false });
  let instance;
  instance = await WebAssembly.instantiate(miri, {
    env: { memory: new WebAssembly.Memory({ initial: 256, maximum: 4096 }) },
    // Miri is built with wasi-threads but this program is single-threaded:
    // a spawned thread runs to completion at once (as in rubri).
    wasi: {
      "thread-spawn": (startArg) => {
        instance.exports.wasi_thread_start(1, startArg);
        return 1;
      },
    },
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  let exit = null;
  let trap = null;
  try {
    exit = wasi.start(instance);
  } catch (error) {
    if (error instanceof WASIProcExit) exit = error.code;
    else trap = String(error?.message ? `${error.name}: ${error.message}` : error);
  }
  return { stdout, stderr, exit, trap };
}
