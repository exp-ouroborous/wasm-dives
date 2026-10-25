# Third-party software in this folder

The Rust card runs these unmodified, pinned files entirely in your browser.

| Component | Version | Licence |
|---|---|---|
| [Miri](https://github.com/rust-lang/miri), compiled to WASI (`bin/miri.opt.1718474653.wasm.gz`) | Rust 1.78.0-dev (2024) | MIT OR Apache-2.0 |
| [Rust standard library](https://github.com/rust-lang/rust) rlibs (`lib/rustlib/x86_64-unknown-linux-gnu/lib/`) | 1.78.0-dev | MIT OR Apache-2.0 |
| [rubri](https://github.com/LyonSyonII/rubri), which published the build above | commit `00de75bcec3d8cf5156aef2382c738cbfe069986` | MIT |
| [browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim) (`@bjorn3/browser_wasi_shim`, in `../../browser_wasi_shim/0.4.2/`) | 0.4.2 | MIT OR Apache-2.0 |

The files are taken from rubri's repository at the commit above
(`example/public/wasm-rustc/`, the gzipped copies), each pinned by SHA-256 in
`runtimes.json`. Compiling Miri to WASI is bjorn3's work
(rust-lang/miri#722); rubri's README credits it.
