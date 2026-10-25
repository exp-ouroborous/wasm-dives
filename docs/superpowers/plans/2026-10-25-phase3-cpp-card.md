# Phase 3: C/C++ Card (Clang in WebAssembly) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a C/C++ language card at wordsfortheunwise.com/learn/cpp/. You type C or C++ and press Run. The real Clang/LLD compiler (YoWASP, in WebAssembly) compiles it to a WASI program, which then runs, all inside the existing sandbox.

**Architecture:**
- **Vendored as-is:** `@yowasp/clang` and `@bjorn3/browser_wasi_shim` are pinned and vendored without bundling; both are plain ES modules.
- **Oversized files:** the two files over Pages' 25 MiB limit (`llvm.core.wasm`, `llvm-resources.tar`) are split into verified parts at build time.
- **Fetch shim:** a worker-level wrapper serves the bundle's own `fetch()` for those files from the reassembled, re-verified parts. Clang needs no changes.
- **Dialect option:** the run protocol gains an optional `options` object (`{ dialect: "c" | "cpp" }`), so one card covers both languages.

**Tech Stack:** `@yowasp/clang@22.0.0-git20542-10` (ISC; LLVM, libc++ and wasi-libc are Apache-2.0 WITH LLVM-exception), `@bjorn3/browser_wasi_shim@0.4.2` (MIT OR Apache-2.0), plain ES modules, Node 26 `node:test`, Cloudflare Pages, Astro.

**Spec:** `docs/superpowers/specs/2026-10-25-wasm-language-cards-design.md` (C/C++ row, Branding).

## Global Constraints

- All phase 1 security rules hold. Stop terminates the worker, killing a compile or a running program alike.
- **Exact pins:** `"@yowasp/clang": "22.0.0-git20542-10"` and `"@bjorn3/browser_wasi_shim": "0.4.2"`. `vendorRuntime` refuses other installed versions.
- **Parts** are at most `20 * 1024 * 1024` bytes, named `<file>.partNN` with a `<file>.json` descriptor (`{ size, sha384, parts }`). The originals are removed from `dist/`.
- **Compile flags:**
  - C++: `clang++ main.cc -std=c++23 -O2 -fno-exceptions -o app.wasm`
  - C: `clang main.c -std=c17 -O2 -o app.wasm`
- **C/C++ colours:** colour `#00599c`, dark `#004482`, keyline `#659ad2`, logo simple-icons 16.35.0 `cplusplus` (CC0).
- **Card copy is exact:**
  - Title: "C and C++ in your browser".
  - Lede: "The real Clang compiler, built for WebAssembly, compiles your program to WebAssembly and runs it — nothing leaves the page."
  - Notice: "C++ is compiled without exceptions (this libc++ build has none), so `throw` fails to link. Programs run with WASI: standard input is empty and there is no network or real filesystem."
- **Routes:** `/learn/cpp` proxies `https://wasm-dives.pages.dev/cards/cpp`; `/run/cpp/` is never proxied.
- **Notice file:** `run/vendor/yowasp-clang/22.0.0-git20542-10/THIRD_PARTY.md` lists YoWASP Clang (ISC), LLVM/Clang/LLD, libc++ and wasi-libc (Apache-2.0 WITH LLVM-exception) and browser_wasi_shim (MIT OR Apache-2.0).

## Review Focus

1. **A part fails or is corrupted:** the boot fails with the retry message and never runs Clang on bad bytes. Covered by the `installPartsFetch` tests (Task 2).
2. **A program that never ends** (`while(1){}`) or a compile that takes very long: Stop works in either phase. Covered by browser check (c) (Task 5).
3. **`abort()`, out-of-bounds traps and non-zero exit codes:** the output printed before the trap is kept, and the trap or exit code appears under `stderr:`. Covered by the `toRunResult` tests (Task 3).
4. **Clang's stderr arrives in tiny chunks:** diagnostics must be parsed from the joined text, not per chunk. Covered by the `parseClangDiagnostics` test using the real chunked sample (Task 3).
5. **Options from an untrusted parent:** `parseMessage` accepts only `options.dialect` in `{ "c", "cpp" }`, and the worker defaults to C++ otherwise. Covered by the protocol tests (Task 1).

---

### Task 1: Run options end to end

**Files:**
- Modify: `site/run/shared/protocol.mjs`, `site/cards/wasm-assets/runner-client.mjs`, `site/run/shared/runner-host.mjs`, `site/run/shared/runtime-worker.mjs`
- Test: `tests/protocol.test.mjs`, `tests/runner-client.test.mjs`, `tests/runner-host.test.mjs`, `tests/runtime-worker.test.mjs`

**Interfaces:**
- `parseMessage` accepts `run` with an optional `options`. If present, it must be a plain object whose only key is `dialect` with value `"c"` or `"cpp"`; anything else rejects the whole message.
- `client.run(source, options?)` posts `{ type: "run", id, source, options }`, leaving out `options` when undefined.
- The runner host forwards `options` to the worker unchanged.
- `serveRuntime`'s `run(runtime, source, options)` receives `data.options ?? {}`.

- [ ] **Step 1: Write the failing tests:**
  - `parseMessage` accepts `{…run, options: { dialect: "c" }}` and rejects `options: { dialect: "rust" }`, `options: { dialect: "c", extra: 1 }` and `options: "c"`.
  - `client.run("x", { dialect: "c" })` posts `options: { dialect: "c" }`, and `client.run("x")` posts no `options` key.
  - The runner host posts `{ type: "run", id, source, options }` to the worker.
  - `serveRuntime` passes `{ dialect: "c" }` to `run` and `{}` when absent.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 2: Vendor Clang and the WASI shim, split the big files, serve them via a fetch shim

**Files:**
- Create: `scripts/parts.mjs` (move `splitFile` out of `scripts/yaegi.mjs`, which then imports it)
- Modify: `scripts/vendor.mjs` (optional `split: string[]`, `partBytes`, `notice`), `runtimes.json` (`cpp`), `package.json` (pinned deps)
- Modify: `site/run/shared/parts.mjs` (add `installPartsFetch`)
- Test: `tests/parts.test.mjs`, `tests/vendor.test.mjs`, `tests/yaegi.test.mjs` (the `splitFile` import path)

**Interfaces:**
- `runtimes.json` `cpp`: `{ "package": "@yowasp/clang", "version": "22.0.0-git20542-10", "vendorDir": "run/vendor/yowasp-clang/22.0.0-git20542-10", "exclude": ["README.md", "lib"], "split": ["gen/llvm.core.wasm", "gen/llvm-resources.tar"], "partBytes": 20971520, "notice": "THIRD_PARTY.md", "also": [{ "package": "@bjorn3/browser_wasi_shim", "version": "0.4.2", "vendorDir": "run/vendor/browser_wasi_shim/0.4.2", "include": ["dist"] }], "files": ["run/cpp/worker.js", "run/cpp/clang-result.mjs", "run/shared/runtime-worker.mjs", "run/shared/parts.mjs"] }`.
- `vendorRuntime` gains:
  - `include` (copy only these top-level entries).
  - `split` (after copying, `splitFile` each listed file and write `<file>.json`).
  - It returns the copied paths with split originals replaced by their parts and descriptors.
- `installPartsFetch(splitUrls: string[], fetcher = globalThis.fetch) => fetch`. It returns a `fetch` that, for a URL whose `href` is in `splitUrls`, resolves to `new Response(await fetchParts(href + ".json", fetcher), { headers: { "content-type": href.endsWith(".wasm") ? "application/wasm" : "application/octet-stream" } })`. Every other URL passes straight to `fetcher`.
- The build writes the `notice` file into `vendorDir` from a template in `scripts/notices/yowasp-clang.md`.

- [ ] **Step 1: Write the failing tests:**
  - `installPartsFetch([BASE + "big.wasm"], fake)("…/big.wasm")` resolves to the reassembled bytes with `content-type: application/wasm`; a non-listed URL is passed through untouched.
  - A corrupt part makes the returned promise reject with `/corrupt/`.
  - `vendorRuntime` with `split: ["gen/big.bin"]` and `partBytes: 4` on a 10-byte file leaves `gen/big.bin.part00..02` plus `gen/big.bin.json`, not `gen/big.bin`. `include: ["dist"]` copies only `dist/**`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement, then** `npm install --save-exact @yowasp/clang@22.0.0-git20542-10 @bjorn3/browser_wasi_shim@0.4.2`.
- [ ] **Step 4: Run** `npm test` (expected: PASS), then `npm run build`. Expected:
  - The log shows `cpp:` at about 105 MB unpacked.
  - `dist/run/vendor/yowasp-clang/…/gen/` holds `llvm.core.wasm.part00..03`, `llvm-resources.tar.part00..01` and their `.json` files.
  - No file is over 25 MiB.
- [ ] **Step 5: Commit.**

### Task 3: The C/C++ worker

**Files:**
- Create: `site/run/cpp/clang-result.mjs`, `site/run/cpp/worker.js`, `site/run/cpp/index.html`
- Test: `tests/clang-result.test.mjs`

**Interfaces:**
- `parseClangDiagnostics(stderrText) => Diagnostic[]` picks lines matching `/^main\.(?:cc|c):(\d+):(\d+): (error|warning|fatal error): (.*)$/m`, giving `{ id: "clang", message, severity: "Error" | "Warning", line, col, start: 0, end: 0 }`. `fatal error` maps to `Error`.
- `compileArgs(dialect)` returns the exact flags from Global Constraints. An unknown or missing dialect means `cpp`.
- `toRunResult({ compiled: false, clangStderr })` gives `{ ok: false, stdout: "", stderr: clangStderr (linker errors only, when there are no diagnostics), diagnostics }`.
- `toRunResult({ compiled: true, stdout, stderr, exit, trap })`:
  - `ok` is `exit === 0 && !trap`.
  - `stderr` appends `"exit code N"` when non-zero, or `"trap: <message>"` (for example "RuntimeError: unreachable (abort() or a crash)").
- `worker.js`:
  - `boot` sets `globalThis.fetch = installPartsFetch([<abs URLs of the two split files>])`, then imports `runClang` from the vendored `gen/bundle.js` and `WASI, File, OpenFile, ConsoleStdout` from the vendored shim.
  - It warms up with `runClang(["clang", "warm.c", "-o", "warm.wasm"], { "warm.c": "int main(void){return 0;}" })`.
  - Its version comes from `runClang(["clang", "--version"])` stdout, first line.
  - `run` compiles with `compileArgs(options.dialect)`, collecting clang stderr through a decoder. It then instantiates `app.wasm` with a fresh `WASI([], [], [stdin empty, stdout, stderr])` and `wasi.start`, catching traps.

- [ ] **Step 1: Write the failing tests:**
  - `parseClangDiagnostics` on the chunk-joined sample `"bad.c:1:25: error: use of undeclared identifier 'undefined_thing'\n…"`, renamed to `main.c`, gives one Error at line 1, col 25.
  - A warning line maps to `severity: "Warning"`.
  - `compileArgs("c")` deep-equals `["clang", "main.c", "-std=c17", "-O2", "-o", "app.wasm"]`.
  - `compileArgs(undefined)` deep-equals the C++ flags.
  - `toRunResult` cases: a failed compile with diagnostics; a link error such as `__cxa_throw` going to stderr; exit 3 gives `ok: false` with `stderr` ending "exit code 3"; a trap keeps the earlier stdout.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 4: The C/C++ card page

**Files:**
- Create: `site/cards/cpp/index.html`, `site/cards/cpp/card.mjs`, `site/cards/cpp/programs.mjs`
- Modify: `site/cards/wasm-assets/card-page.mjs` (optional `scratchpadOptions()` and per-experiment `options`), `site/cards/wasm-assets/languages.mjs` (`cpp`)
- Test: `tests/cpp-card.test.mjs`, `tests/languages.test.mjs`, `tests/card-page.test.mjs`

**Interfaces:**
- `startLanguageCard` accepts `scratchpadOptions?: () => object`, sent with scratchpad runs. An experiment may carry `options`, which are sent with its run. The probe sends `programs.PROBE_OPTIONS`.
- The C/C++ page has a `<select id="dialect">` (C++ (C++23) / C (C17)). Its `card.mjs`:
  - passes `scratchpadOptions: () => ({ dialect: select.value })`.
  - swaps the scratchpad text to the other dialect's default when the selection changes, but only if the text is still the untouched default.
- `programs.mjs`:
  - `SCRATCHPAD_DEFAULT` (C++) and `SCRATCHPAD_DEFAULT_C`.
  - `EXPERIMENTS`:
    - `templates` ("Templates and constexpr", C++): a `constexpr` factorial, a variadic `sum`, and `std::ranges::sort` over a `std::vector`.
    - `structs` ("Structs and pointers", C): a linked list with `malloc`/`free` and `printf`.
  - `PROBE_SOURCE`, sent as C++, prints `__clang_version__`, `__cplusplus`, `sizeof(void*)`, `__wasm32__`, and a 10M-iteration loop timed with `std::chrono`.
- `LANGUAGES.cpp` uses the Global Constraints colours and the `cplusplus` logo.

- [ ] **Step 1: Write the failing tests:**
  - The exact title, lede and notice.
  - The regions, `id="dialect"` with options `cpp`/`c`, `sandbox="allow-scripts allow-same-origin"`, and no `innerHTML`.
  - Experiment ids `["templates", "structs"]` with dialects `cpp`/`c`.
  - No bundled C++ program contains `throw` or `try`.
  - `LANGUAGES.cpp.color === "#00599c"`.
  - `card-page.mjs` passes `scratchpadOptions`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Browser verification

- [ ] **Step 1:** `npm run build && npm run dev`, then use Playwright Chromium. Clear the `127.0.0.1:8788` service worker and caches first.
- [ ] **Step 2:** On `/cards/cpp/`, check:
  - (a) The first Run shows the bar climbing to about 105 MB, then the C++ output. The version line starts "clang version 22".
  - (b) An undeclared identifier shows `line:col: use of undeclared identifier …`.
  - (c) Stop during a `while (true) {}` run gives "Stopped." within 1 s, and the next Run works.
  - (d) `abort()` after a `printf` shows the output, then a trap under `stderr:`.
  - (e) Switching to C and running the C default works.
  - (f) Both experiments and the probes run.
  - (g) A reload compiles from cache, with no network fetch of the `*.part*` files.
- [ ] **Step 3:** Recheck that the Go and C# cards still say hello. Shared protocol code changed in Task 1.

### Task 6: Ship

- [ ] **Step 1: wasm-dives.** Push, then open a PR with a balanced body. Weakest points to list:
  - A 21 MB brotli first download.
  - The upstream project is archived.
  - No C++ exceptions.
  - The fetch shim replaces `globalThis.fetch` inside the worker.
  - A protocol change touches all cards.
  Then run the Codex review, fix verified findings test-first, rebase-merge, deploy and check on `wasm-dives.pages.dev`.
- [ ] **Step 2: words-for-the-unwise.**
  - Proxy rule `/learn/cpp`, with a test that `/learn/cpp/` maps and `/learn/cppx` returns null.
  - A `/learn` card: C++ logo, `#00599c`, title "C/C++", blurb "C and C++ in your browser", detail "Real Clang in WebAssembly."
  - Update the AGENTS.md line.
  - `npm run verify`, Codex review, PR, Copilot via REST, wait for CI to pass, rebase-merge.
- [ ] **Step 3: Verify live:** `/learn/cpp/` compiles and runs, with its runner on `wasm-dives.pages.dev`.
