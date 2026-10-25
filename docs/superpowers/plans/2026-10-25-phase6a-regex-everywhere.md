# Phase 6a: Regex Tester in Every Language — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On wordsfortheunwise.com/learn/regex-tester/ you pick a language — Python, C#, Go or C/C++ — from a branded dropdown (logo plus language colour), and the regex is analysed by that language's own regex engine running in WebAssembly. Python keeps running in the page. The others run in the sandbox runner, reusing the language runtimes and their caches.

**Architecture:**
- **Engine calls.** The protocol gains `call { id, engine, input }` → `called { id, ok, output, error, ms }`. `serveRuntime` gains an optional `call(runtime, engine, input)`, and each language worker loads an engine once and then answers calls.
  - Python: a persistent namespace.
  - Go: `yaegiLoad`/`yaegiCall` exports.
  - C#: `Runner.LoadEngine` (compiles a DLL once) and `Runner.CallEngine`.
  - C/C++: the engine is compiled once, then the WASI binary runs per call with argv.
- **Engine sources** live in `site/run/<lang>/engines/regex.*`, hash-listed like everything else.
- **Shared contract cases** in `tests/engines/regex-cases.json` are run against every engine in Node:
  - Python through Pyodide.
  - Go through the built Yaegi wasm.
  - C++ through YoWASP Clang plus the WASI shim.
  - C# through `dotnet run` on a file-based app that compiles the same engine source.

**Spec:** the design spec's Tool cards and Branding sections. No silent fallback: a language that can't do something says so.

## The regex contract (every engine)

- **Input:** `{ pattern, text, flags: string[] ⊆ ["ignorecase", "multiline", "dotall"], replacement }`.
- **Output:** `{ ok, error, engine, match_count, matches: [{ index, match, start, end, groups, numbered_groups }], substitution, full_match }`.
- **Offsets (`start`, `end`)** are in **Unicode code points** in every language.
- **`replacement`** uses `$1` and `$name` in every language. Each engine translates to its own syntax.
- **Unsupported features** return `ok: false` with an `error` naming the engine's limit:
  - Go (RE2): no lookaround or backreferences.
  - C++ (`std::regex` ECMAScript): no named groups, no `dotall`.
- **`engine`** is a display string, for example "Python re", ".NET System.Text.RegularExpressions", "Go regexp (RE2)", "C++ std::regex (ECMAScript)".
- **The `ascii` flag is dropped** from the UI: only Python has it.

## Global Constraints

- **Security unchanged.** `call` is validated like `run`: `engine` must be a known name; `input` must be a plain object of strings and string arrays, at most 1 MB serialized.
- **The dropdown** is built from `languages.mjs` (logo plus colour per option) and is keyboard accessible: a button with `aria-haspopup="listbox"`, a `role="listbox"` of `role="option"` items, and arrow, Enter and Escape keys.
- **Workflow:** branch, tests first, Codex review, rebase merge. wasm-dives deploys by hand; misc-dives deploys through Pages Git integration.

## Review Focus

1. **Astral characters** such as emoji before a match: every engine reports code-point offsets. Covered by a contract case.
2. **A pattern that one engine rejects** (lookbehind in Go, a named group in C++) gives a clear `ok: false`. Covered by contract cases with per-engine expectations.
3. **Switching language while a call is pending** must not show the old engine's result. Covered by picker/client tests.
4. **Catastrophic backtracking** in .NET, Python or C++: Stop and the timeout exist only in the runner. The page shows "still running… (Stop)". Checked in the browser.
5. **A runtime not yet downloaded:** the first use shows the progress bar's text in the tool's status line. Checked in the browser.

---

### Task 1: Protocol and runtime-worker support for engine calls
- [ ] Tests:
  - `parseMessage` accepts `call` with a known engine and a plain input; it rejects an unknown engine, a non-object input and an oversized input.
  - `client.call(engine, input)` posts and resolves on a `called` with the matching id, and ignores any other id.
  - The runner host forwards `call` to the worker and posts `called` back.
  - `serveRuntime` routes `call` to `call()` and reports thrown errors as `ok: false`.
- [ ] Implement, `npm test`, commit.

### Task 2: Contract cases and the Python engine
- [ ] `tests/engines/regex-cases.json`, with each case naming its expected `match_count`, first-match `start`/`end`, `groups` and `substitution`, plus `expect_error` overrides per engine:
  - simple
  - groups (named and numbered)
  - flags
  - replacement with `$1` and `$name`
  - astral characters (😀) before a match
  - an invalid pattern
  - lookbehind
  - a named group
- [ ] `site/run/python/engines/regex.py`: `handle(input_json) -> str`, ported from misc-dives' `tool.py` with code-point offsets (Python already counts in code points).
- [ ] A test running the cases through Pyodide in Node. Worker `call` support: load the engine once per runtime. Commit.

### Task 3: Go engine
- [ ] `runtimes/go/main.go` adds `yaegiLoad(name, source)` (a persistent interpreter per engine) and `yaegiCall(name, input) → Promise<string>`.
- [ ] `site/run/go/engines/regex.go`: `package main` with `func Handle(input string) string`. It uses `regexp`, maps flags to `(?i)`, `(?m)` and `(?s)`, converts byte offsets to code points, maps `$name` to `${name}`, and turns compile errors into errors.
- [ ] A test running the cases through the built wasm in Node. Worker `call`. Commit.

### Task 4: C/C++ engine
- [ ] `site/run/cpp/engines/regex.cc`: argv is `pattern`, `text`, `replacement`, `flags-csv`; it prints JSON. It uses `std::regex` (ECMAScript, `icase`, `multiline`), counts code points over UTF-8, and rejects `(?<name>` and `dotall` with clear errors.
- [ ] Worker `call` compiles the engine once (`-std=c++23 -O2 -fno-exceptions`), then runs it per call.
- [ ] A test compiling with YoWASP Clang and running the cases in Node. Commit.

### Task 5: C# engine
- [ ] `Runner.LoadEngine(name, source)` (a DLL compilation, kept loaded) and `Runner.CallEngine(name, input)` (invokes `Engine.Handle(string)`), as `[JSExport]`.
- [ ] `site/run/csharp/engines/regex.cs`: `System.Text.RegularExpressions` with `RegexOptions`, UTF-16 to code-point offsets, and `$name` → `${name}`.
- [ ] A test running the cases through `dotnet run` on a file-based app that includes the engine source. Worker `call`. Commit.

### Task 6: Branded language dropdown and the regex page
- [ ] `site/cards/wasm-assets/language-picker.mjs`: `createLanguagePicker({ root, languages, value, onChange })`, with a tested pure keyboard reducer (`pickerKeyReducer`).
- [ ] misc-dives `dives/regex-tester/index.html`:
  - The picker sits above the inputs.
  - Python keeps calling the in-page `tool.py`.
  - The others use a hidden sandbox iframe and `client.call("regex", input)`, with debounce and stale-result guarding.
  - It shows the engine name and the runtime status (downloading/starting).
  - The `ascii` flag is removed.
  - Tests in misc-dives `tests/` for the page regions and the picker wiring.
- [ ] Browser check through the proxy for all four languages, plus the astral-offset case and the per-engine errors. Commit both repos.

### Task 7: Ship
- [ ] wasm-dives PR, Codex review, merge, deploy. Then misc-dives PR, Codex review, merge (Pages). Check live at `/learn/regex-tester/`.
