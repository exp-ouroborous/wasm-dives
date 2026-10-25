# Phase 5: Rust card (experimental)

> Executed natively, after phases 6a–6d.

**Goal:** a Rust language card (runtime panel with progress, scratchpad,
experiments, probes) that runs Rust entirely in the browser, labelled
experimental.

## Ruling: Miri (via rubri's build), not rubrc

The spec named rubrc. Checked on 2026-10-25:

- rubrc v2 is a pre-release SolidJS app with no releases or artifacts; its
  toolchain is ~225 MB of committed wasm (rustc 95 MB, LLVM 84 MB, …) composed
  with a custom CLI, it needs COOP/COEP (so wordsfortheunwise.com's
  `/learn/rust/` would have to be cross-origin isolated), and its README warns
  sessions can become unusable.
- rubri (MIT) runs **Miri**, Rust's MIR interpreter, compiled to WASI by
  bjorn3's work: ~60 MB gzipped (Miri 17 MB + the std rlibs), plain
  single-threaded WASI. A Node spike ran it with our pinned
  `@bjorn3/browser_wasi_shim` 0.4.2: hello world in 0.4 s, real rustc
  diagnostics, `HashMap`, iterators; a 200k-iteration loop takes ~1.2 s.

Miri fits the existing runner/worker model, needs no isolation headers (the
spec allows COOP/COEP only where a runtime requires them; this one does not),
and matches the spec's ~60 MB budget. Cost: Rust is interpreted, not compiled
(slow, no crates, Rust 1.78.0-dev from 2024). The card says all of that.
Cost if wrong: swapping in rubrc later is a new runtime behind the same card.

## Runtime

- Files: rubri commit `00de75bcec3d8cf5156aef2382c738cbfe069986`,
  `example/public/wasm-rustc/**.gz` (28 files), each pinned by SHA-256 in
  `runtimes.json`, downloaded once into `.cache/`, copied into
  `run/vendor/rubri/00de75bc/`, and covered by the manifest's SHA-384. Served
  gzipped; the worker inflates them with `DecompressionStream`. No file is
  over Pages' 25 MiB limit, so no parts.
- Miri flags as rubri's (checks off for speed) plus `-Cpanic=abort`: the
  build cannot unwind, and with abort a panic prints its message and ends.
- The worker: boot fetches and inflates the files, compiles Miri, builds the
  `/sysroot` tree; run writes `main.rs` and instantiates a fresh Miri.

## Tasks

1. Pinned-file vendoring (generalise `scripts/wheels.mjs`) + `runtimes.json`
   `rust` entry + build branch + LICENSE/notice.
2. `run/rust/`: runner page, worker, `rust-result.mjs` (rustc diagnostics,
   panics, exit codes) with tests; a Node test running real Miri on the
   card's programs.
3. `cards/rust/`: page, card script, programs (scratchpad, experiments,
   probe); Rust in `languages.mjs`.
4. words-for-the-unwise: `/learn/rust/` proxy rule and the language card
   (experimental badge, Rust logo).
5. Codex reviews, PRs, deploys, live check.
