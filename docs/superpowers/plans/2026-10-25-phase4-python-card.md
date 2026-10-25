# Phase 4: Python Card on the Sandbox Runner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Typed Python runs only in the sandbox. A new Python card at wordsfortheunwise.com/learn/python/ runs CPython 3.14 (Pyodide 314.0.7) in the separate-origin runner, with progress, Stop and caching. The `/learn` languages row points to it. The original Pyodide dive keeps its experiments but loses its main-origin scratchpad, and its Pyodide script gains an integrity hash.

**Architecture:** This reuses the sandbox unchanged:
- **Vendoring:** the npm `pyodide@314.0.7` core files are vendored and hash-listed like the other runtimes.
- **Worker:** a `serveRuntime` worker boots Pyodide with `indexURL` set to the vendored folder.
- **Packages:** they load on first import from the matching pinned jsDelivr folder (`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`). Pyodide checks each wheel's SHA-256 against `pyodide-lock.json`, which our service worker itself verifies. *(call — see Rulings)*

**Spec:** the design spec's Python row and phase 4.

## Global Constraints

- **Pin:** `"pyodide": "314.0.7"` (MPL-2.0). Only `pyodide.mjs`, `pyodide.asm.mjs`, `pyodide.asm.wasm`, `python_stdlib.zip` and `pyodide-lock.json` are vendored, to `run/vendor/pyodide/314.0.7/`, plus `THIRD_PARTY.md`.
- **Each run** gets a fresh globals dict. Stdout and stderr are captured with `setStdout`/`setStderr({ batched })`. A value from the last expression is shown as `=> <repr>`.
- **Python colours** already exist in `languages.mjs`: `#3776ab`, keyline `#ffd43b`, Python logo.
- **Card copy is exact:**
  - Title: "Python in your browser".
  - Lede: "Real CPython 3.14, compiled to WebAssembly by Pyodide, running in a sandbox — nothing leaves the page."
  - Notice: "The standard library is built in. Packages such as <code>numpy</code> load on first import from the pinned Pyodide 314.0.7 release, each checked against its lock-file hash."
- **Routes:** `/learn/python` proxies `https://wasm-dives.pages.dev/cards/python`; `/run/python/` is never proxied.
- **The `/learn` languages row's first card** becomes "Python" → `/learn/python/`. The Pyodide dive stays at `/learn/pyodide/` and is linked from the Python card ("More Pyodide experiments →").

## Review Focus

1. **Syntax errors** show as `line N: SyntaxError: …` diagnostics, not a raw traceback. Covered by the `toRunResult` tests (Task 2).
2. **A runtime exception keeps the output printed before it,** with the traceback under stderr. Covered by the `toRunResult` tests (Task 2).
3. **`while True: pass` is stopped by Stop.** Covered by browser check (Task 4).
4. **A failed package download** surfaces as Pyodide's error in stderr, and the next Run still works. Covered by `toRunResult` (Task 2).
5. **The dive's remaining Pyodide script tag** carries `integrity="sha384-…"` and `crossorigin="anonymous"`. Covered by a pyiodide-dives site test (Task 5).

---

### Task 1: Vendor Pyodide; build support for `include` plus own files on plain vendored runtimes
- [ ] Tests: `runtimes.json`'s `python.version === "314.0.7"`, and `include` lists exactly the 5 core files. A build-unit test that a non-split vendored runtime's manifest group includes `spec.files`.
- [ ] Implement: the `runtimes.json` entry, `scripts/notices/pyodide.md` (Pyodide MPL-2.0 with a source link; CPython PSF-2.0), and the build adding `spec.files` and the notice to plain vendored groups.
- [ ] Run `npm test`, then `npm run build`. Expected: `python:` at about 13.5 MB. Commit.

### Task 2: Python worker and result mapping
- [ ] Tests for `site/run/python/py-result.mjs` `toRunResult({ out, err, value, error })`:
  - Success with a value appends `=> 2`.
  - A `SyntaxError` traceback (`File "<exec>", line 2`) becomes a diagnostic `{ id: "python", line: 2, col: 0, message: "SyntaxError: invalid syntax" }`.
  - A `ZeroDivisionError` keeps stdout `before\n`, with the stderr traceback ending `ZeroDivisionError: division by zero`.
  - Package-load notes passed as `notes` are prefixed to stdout as `(loaded numpy)`.
- [ ] Implement `py-result.mjs` and `worker.js`:
  - `boot`: `loadPyodide({ indexURL, packageBaseUrl, packages: [] })`; version "Python 3.14.2 · Pyodide 314.0.7".
  - `run`: `loadPackagesFromImports` with a message callback, then `runPythonAsync` with fresh globals.
  - Add `run/python/index.html`.
- [ ] `npm test`, commit.

### Task 3: Python card page
- [ ] Tests: the exact copy, regions, a link to `/learn/pyodide/`, experiment ids `["csv", "dataclasses"]`, and no `innerHTML`.
- [ ] Implement `cards/python/{index.html, card.mjs, programs.mjs}`:
  - Experiments: "CSV and statistics" (stdlib `csv`, `statistics`), and "Dataclasses and pattern matching".
  - Probes: `sys.version`, `platform.machine()`, `sys.platform`, `os.cpu_count()`, and a 1M-iteration loop timed with `time.perf_counter`.
- [ ] `npm test`, commit.

### Task 4: Browser verification (Chromium)
- [ ] Check the progress bar to the full total, hello, the `=>` value, a syntax error, a traceback with prior output, Stop on `while True: pass`, `import numpy` loading from the CDN (`(loaded numpy)` and the array output), both experiments and the probes, and a reload served from cache.
- [ ] Recheck that C#, Go and C/C++ still say hello.

### Task 5: Ship
- [ ] **wasm-dives:** PR (balanced), Codex review, rebase-merge, deploy, check live.
- [ ] **words-for-the-unwise:** proxy `/learn/python` with a test (and `/learn/pythonx` returns null). The languages row's first card becomes Python → `/learn/python/` ("Python in your browser" / "CPython 3.14 via Pyodide."). Update AGENTS.md, then verify, Codex review, PR, wait for CI, merge, check live.
- [ ] **pyiodide-dives:** replace the "Python scratchpad" section with a short pointer to `/learn/python/` and remove `scratchpad.js` and `scratchpad_runner.py`. Add `integrity` and `crossorigin="anonymous"` to the `pyodide.js` script. Update `tests/site.test.mjs`, then Codex review, PR, merge (Pages Git integration deploys), check live.
