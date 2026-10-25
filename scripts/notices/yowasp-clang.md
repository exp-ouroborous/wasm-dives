# Third-party software in this folder

The C/C++ card runs these unmodified, pinned packages entirely in your browser.

| Component | Version | Licence |
|---|---|---|
| [YoWASP Clang/LLD](https://github.com/YoWASP/clang) (`@yowasp/clang`) | 22.0.0-git20542-10 | ISC |
| [LLVM, Clang and LLD](https://llvm.org/) (inside `llvm.core.wasm`) | 22 (snapshot) | Apache-2.0 WITH LLVM-exception |
| [libc++, libc++abi, compiler-rt](https://llvm.org/) (inside `llvm-resources.tar`) | 22 (snapshot) | Apache-2.0 WITH LLVM-exception |
| [wasi-libc](https://github.com/WebAssembly/wasi-libc) (inside `llvm-resources.tar`) | bundled with the above | Apache-2.0 WITH LLVM-exception, MIT, CC0-1.0 (per file) |
| [browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim) (`@bjorn3/browser_wasi_shim`, in `../../browser_wasi_shim/0.4.2/`) | 0.4.2 | MIT OR Apache-2.0 |

`llvm.core.wasm` and `llvm-resources.tar` are split into parts only to fit
Cloudflare Pages' 25 MiB file limit; the browser reassembles them and checks
each against its recorded SHA-384 before use.
