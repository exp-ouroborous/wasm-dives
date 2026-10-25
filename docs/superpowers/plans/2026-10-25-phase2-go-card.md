# Phase 2: Go Card (Yaegi in WebAssembly) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Go language card at wordsfortheunwise.com/learn/go/. You type Go and press Run. The Yaegi interpreter, built from source to WebAssembly by us and served in parts to fit Cloudflare Pages, runs it in the existing sandbox with progress, Stop and caching.

**Architecture:** This reuses phase 1's sandbox unchanged: the runner page, verifying service worker, runner client, `serveRuntime` worker contract and manifest. New pieces:
- A Docker-pinned Go build of a small `yaegiRun` wrapper around `traefik/yaegi`.
- A build step that splits the 37 MB `.wasm` into hash-listed parts.
- A worker that reassembles and verifies the parts before instantiating them.
- A shared card-page module, so the Go and C# cards are configuration, not copies.

**Tech Stack:** Go 1.22.12 in Docker (`GOOS=js GOARCH=wasm`), `github.com/traefik/yaegi` v0.16.1, plain ES modules, Node 26 `node:test`, Cloudflare Pages, Astro (words-for-the-unwise).

**Spec:** `docs/superpowers/specs/2026-10-25-wasm-language-cards-design.md` (the Go row and the Branding section).

## Global Constraints

- **Browser-only;** no server compile or run. All phase 1 security rules hold: separate-origin runner, dedicated worker, Stop terminates it, origin allowlists, `textContent` only, nothing auto-runs.
- **Yaegi is pinned** at `github.com/traefik/yaegi v0.16.1` (Apache-2.0), with `go.sum` committed. Its `LICENSE` ships next to the binary.
- **Toolchain image is pinned:** `golang:1.22.12@sha256:1cf6c45ba39db9fd6db16922041d074a63c935556a05c5ccb62d181034df7f02`. Build flags are `GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w"`. `wasm_exec.js` is copied from that image's `$(go env GOROOT)/misc/wasm/wasm_exec.js`.
- **Parts:** at most `20 * 1024 * 1024` bytes each, named `yaegi.wasm.part00`, `part01`, … in `run/vendor/yaegi/0.16.1/`. Every part is in the manifest, and the reassembled whole is checked against its own SHA-384 in `yaegi.wasm.json`.
- **Go colours** (in `languages.mjs`): colour `#00add8`, dark `#007d9c`, keyline `#5dc9e2`. The logo is simple-icons 16.35.0 `go` (CC0).
- **Card copy is exact:**
  - Title: "Go in your browser".
  - Lede: "A Go interpreter (Yaegi) compiled to WebAssembly, running Go 1.22-era programs — nothing leaves the page."
  - Notice: "This is an interpreter, not the Go compiler: programs run slower than compiled Go, and a few things are missing — the `min` and `max` built-ins, generic standard-library functions such as `slices.Sort`, and type inference for functions with two type parameters (write `Map[int, string](…)`)."
- **Routes:** `/learn/go` proxies `https://wasm-dives.pages.dev/cards/go`; `/run/go/` is never proxied.
- **Workflow:** each repo branches from `origin/main`, then PR, Codex review and rebase merge. wasm-dives deploys manually: `npx wrangler pages deploy dist --project-name wasm-dives --branch main`.

## Review Focus

1. **A part fails or is corrupted** (network drop, a stale cached part after a redeploy). The worker must report `boot-failed` with "The runtime failed to start — press Run to retry", never instantiate bad bytes. Covered by the `fetchParts` whole-hash test (Task 3).
2. **A program that never ends** (`for {}`, or a goroutine blocked forever): Stop terminates the worker. A deadlocked `main` must not hang the card either: Yaegi returns `all goroutines are asleep` as an error, which shows as a runtime error. Covered by the `toRunResult` panic/deadlock test (Task 3) and browser check (c) (Task 5).
3. **Output from a panic:** the panic message and Yaegi's `N:M: panic:` stderr line both reach the output under `stderr:`, not as a compile diagnostic. Covered by the `toRunResult` tests (Task 3).
4. **Docker missing or the image digest unavailable at build time:** `npm run build` must fail with a message naming the pinned image, not silently ship without Go. Covered by the `assertDocker` test (Task 2).
5. **A rebuild with nothing changed** must not re-run Docker; the parts are cached under `.cache/yaegi/<version>-<digest12>/`. Covered by the `yaegiCacheDir` test (Task 2) and a timed second build in Task 2, step 5.

---

### Task 1: Shared card-page module, Go colours and logo

**Files:**
- Create: `site/cards/wasm-assets/card-page.mjs`
- Modify: `site/cards/csharp/card.mjs` (becomes configuration plus one call)
- Modify: `site/cards/wasm-assets/languages.mjs` (add `go`)
- Test: `tests/card-page.test.mjs`, `tests/languages.test.mjs`

**Interfaces:**
- Produces `startLanguageCard({ language, runtimeLabel, phaseText, programs, doc = document, loc = location })`:
  - `language` is the `LANGUAGES` key and the runner path (`/run/<language>/`).
  - `runtimeLabel` is used in "Stopped — the next Run restarts the <runtimeLabel> runtime."
  - `phaseText` is `{ idle, downloading, starting, ready, running }`.
  - `programs` is `{ SCRATCHPAD_DEFAULT, EXPERIMENTS, PROBE_SOURCE }`.
  - It does everything the C# `card.mjs` does today: theme, logo, iframe, runner client, phases, progress, notice, run buttons, Stop.
- Produces `LANGUAGES.go = { label: "Go", color: "#00add8", dark: "#007d9c", keyline: "#5dc9e2", logo: { title: "Go", path: <simple-icons go path> } }`.

- [ ] **Step 1: Write the failing tests:**
  - `card-page.mjs` contains no `innerHTML`/`outerHTML`/`insertAdjacentHTML`.
  - `site/cards/csharp/card.mjs` is under 30 lines and calls `startLanguageCard({ language: "csharp"`.
  - `LANGUAGES.go.color === "#00add8"` and `LANGUAGES.go.logo.title === "Go"`.
  - The existing field-validation test covers `go`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Move the C# card body into `startLanguageCard` unchanged in behaviour; the C# phase strings move into the C# `card.mjs` as its `phaseText`.
- [ ] **Step 4: Run** `npm test` (expected: PASS), then `npm run build && npm run dev`. In Chromium, check that the C# card still runs hello, shows the purple theme and Stops a `while(true){}`.
- [ ] **Step 5: Commit.**

### Task 2: Build Yaegi to WebAssembly and split it into parts

**Files:**
- Create: `runtimes/go/main.go`, `runtimes/go/go.mod`, `runtimes/go/go.sum`
- Create: `scripts/yaegi.mjs`
- Modify: `runtimes.json` (add `go`), `scripts/build.mjs` (handle `spec.yaegi`), `.gitignore` (`.cache/`)
- Test: `tests/yaegi.test.mjs`

**Interfaces:**
- `runtimes/go/main.go`, build-tagged `js && wasm`:
  - Exposes `globalThis.yaegiRun(source) → Promise<{stdout, stderr, error}>`. It runs a fresh `interp.New(interp.Options{Stdout, Stderr})` plus `Use(stdlib.Symbols)` and `Eval(source)` inside a goroutine, resolving the promise when done. Synchronous evaluation inside `js.FuncOf` deadlocks on channels and `time.Sleep`.
  - Exposes `globalThis.yaegiGoVersion = runtime.Version()`.
  - `main` blocks on `select {}`.
- `runtimes.json` entry: `"go": { "yaegi": { "module": "github.com/traefik/yaegi", "version": "v0.16.1", "image": "<pinned image@digest>", "source": "runtimes/go", "vendorDir": "run/vendor/yaegi/0.16.1", "partBytes": 20971520 }, "files": ["run/go/worker.js", "run/shared/runtime-worker.mjs", "run/shared/parts.mjs"] }`.
- `scripts/yaegi.mjs` exports:
  - `splitFile(path, partBytes) => Promise<{ size: number, sha384: string, parts: string[] }>`. It writes `<name>.partNN` beside the file, deletes the original, and returns basenames in order.
  - `yaegiCacheDir(root, spec) => string`, which gives `<root>/.cache/yaegi/<version>-<first 12 hex of the image digest>`.
  - `assertDocker(run = execFileSync) => void`, which throws `Docker is required to build the Go runtime (pinned image golang:1.22.12@sha256:…)` when `docker version` fails.
  - `buildYaegi(root, dist, spec) => Promise<string[]>`. On a cache miss it runs Docker to produce `yaegi.wasm`, `wasm_exec.js` and `LICENSE` (from the module cache). It then copies them into `dist/<vendorDir>`, splits the wasm, writes `yaegi.wasm.json` and returns the dist-relative paths for the manifest group.

- [ ] **Step 1: Write the failing tests:**
  - `splitFile` on a 50-byte temp file with `partBytes = 20` writes `part00`/`part01`/`part02` with sizes 20/20/10. Concatenated, they equal the original. `sha384` matches the original's SRI hash, and the original is gone.
  - `yaegiCacheDir("/r", { version: "v0.16.1", image: "golang:1.22.12@sha256:1cf6c45ba39db9fd…" })` returns `"/r/.cache/yaegi/v0.16.1-1cf6c45ba39d"`.
  - `assertDocker(() => { throw new Error("no docker"); })` throws, naming `golang:1.22.12@sha256:`.
  - `runtimes.json`'s `go.yaegi.version === "v0.16.1"`, its `image` matches `/@sha256:[0-9a-f]{64}$/`, and `partBytes <= 25 * 1024 * 1024`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Write `main.go` (as above), then generate `go.mod`/`go.sum` in the pinned container: `go mod init wasm-dives/yaegi-runner && go get github.com/traefik/yaegi@v0.16.1`. Then `scripts/yaegi.mjs` and the `build.mjs` branch.
- [ ] **Step 4: Run** `npm test` (expected: PASS), then `npm run build`. Expected:
  - The log prints `go:` with about 37 MB unpacked.
  - `dist/run/vendor/yaegi/0.16.1/` holds `yaegi.wasm.part00`, `yaegi.wasm.part01`, `yaegi.wasm.json`, `wasm_exec.js` and `LICENSE`.
  - `assertPagesFileLimits` passes.
- [ ] **Step 5: Run** `npm run build` again. Expected: no `docker run` in the log (cache hit), and the build is noticeably faster.
- [ ] **Step 6: Commit** `runtimes/go/` (including `go.sum`), the scripts, `runtimes.json` and the tests.

### Task 3: Go worker — reassemble, verify, run

**Files:**
- Create: `site/run/shared/parts.mjs`, `site/run/go/yaegi-result.mjs`, `site/run/go/worker.js`, `site/run/go/index.html`
- Modify: `site/cards/wasm-assets/format.mjs` (`formatDiagnostics` prints `line:col` when present)
- Test: `tests/parts.test.mjs`, `tests/yaegi-result.test.mjs`, `tests/format.test.mjs`

**Interfaces:**
- `fetchParts(descriptorUrl, fetcher = fetch) => Promise<Uint8Array>`. It reads `{ size, sha384, parts }`, fetches each part relative to the descriptor, concatenates them, and checks the size and `verifySha384` (from `../sw-core.mjs`). It throws `Error("Go runtime download is corrupt")` on a mismatch.
- `toRunResult({ stdout, stderr, error }) => { ok, stdout, stderr, diagnostics }`:
  - An `error` matching `/^(\d+):(\d+): (.*)$/s`, with no `panic:` in `stderr`, becomes a compile diagnostic: `{ id: "go", message, severity: "Error", line, col, start: 0, end: 0 }`.
  - Any other `error` (panics, deadlocks) becomes `ok: false` with `stderr` holding the trimmed stderr plus the error.
  - An empty `error` means `ok: true`.
- `formatDiagnostics` prints `"<line>:<col>: <message>"` for a diagnostic with `line`, unchanged otherwise.
- `worker.js`:
  - `serveRuntime({ boot, run })`.
  - `boot` imports `../vendor/yaegi/0.16.1/wasm_exec.js` for its side effect (it sets `globalThis.Go`), then `fetchParts(new URL("../vendor/yaegi/0.16.1/yaegi.wasm.json", import.meta.url))`, then `WebAssembly.instantiate(bytes, go.importObject)`, then `go.run(instance)` (not awaited; `main` never returns).
  - `boot` returns `{ runtime: globalThis.yaegiRun, version: "${yaegiGoVersion} · Yaegi v0.16.1" }`.
  - `run` is `toRunResult(await runtime(source))`.
- `index.html` is the C# runner page with `language: "go"`.

- [ ] **Step 1: Write the failing tests:**
  - `fetchParts` with a fake fetcher serving two parts of `"abc"` (`"ab"`, `"c"`) and the right descriptor resolves to bytes equal to `"abc"`. With one part altered it rejects with `/corrupt/`. With a wrong `size` it rejects.
  - `toRunResult({ stdout: "", stderr: "", error: "2:15: undefined: undefinedThing" })` gives `ok: false`, one diagnostic with `line: 2, col: 15, message: "undefined: undefinedThing"`.
  - `toRunResult({ stdout: "", stderr: "2:19: panic: main.main(...)\n", error: "assignment to entry in nil map" })` gives `ok: false`, no diagnostics, and `stderr` containing both lines.
  - `toRunResult({ stdout: "", stderr: "", error: "all goroutines are asleep - deadlock!" })` gives `ok: false`, with `stderr` matching `/deadlock/`.
  - `toRunResult({ stdout: "hi\n", stderr: "", error: "" })` gives `ok: true` and `stdout: "hi\n"`.
  - `formatDiagnostics([{ id: "go", message: "undefined: x", severity: "Error", line: 2, col: 15, start: 0, end: 0 }]) === "2:15: undefined: x"`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 4: The Go card page

**Files:**
- Create: `site/cards/go/index.html`, `site/cards/go/card.mjs`, `site/cards/go/programs.mjs`
- Test: `tests/go-card.test.mjs`

**Interfaces:**
- `card.mjs`: `startLanguageCard({ language: "go", runtimeLabel: "Go", phaseText, programs })`, with `phaseText`:
  - `idle`: "Not loaded yet — press Run to download the Go interpreter."
  - `downloading`: "Downloading the Go interpreter (Yaegi)…"
  - `starting`: "Starting Go…"
  - `ready`: "Ready."
  - `running`: "Running…"
- `programs.mjs`. Every program avoids the documented gaps (all were checked in the spike):
  - `SCRATCHPAD_DEFAULT`: hello plus a goroutine fan-in with `sync.WaitGroup`.
  - `EXPERIMENTS`:
    - `goroutines` ("Goroutines and channels"): a 3-worker pool over a jobs channel, plus a `select` with `time.After`.
    - `generics` ("Generics"): a `Number` constraint with `Sum[T Number]`, `Stack[T any]`, and `Map[int, string](…)` with explicit type arguments.
  - `PROBE_SOURCE`: prints `runtime.GOOS`, `GOARCH`, `Version()`, `NumCPU()`, `NumGoroutine()`, and a 1,000,000-iteration loop timed with `time.Since`. Not 10M: that takes about 1.8 s interpreted.
- `index.html` matches the C# card's regions, with the exact title, lede and notice from Global Constraints.

- [ ] **Step 1: Write the failing tests:**
  - `index.html` contains the exact title, lede and notice, the `scratchpad`/`experiments`/`probes`/`runtime` regions, `<progress`, `sandbox="allow-scripts allow-same-origin"` and `id="language-logo"`, and no `innerHTML`.
  - `EXPERIMENTS.map((e) => e.id)` deep-equals `["goroutines", "generics"]`.
  - No bundled program matches `/\bmin\(|\bmax\(|slices\.|maps\./`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Browser verification

**Files:** none. Screenshots go to `.local/testing/`.

- [ ] **Step 1:** `npm run build && npm run dev`, then use Playwright Chromium. The app's built-in browser pane has no service workers; use it only for check (f). Clear the `127.0.0.1:8788` service worker and caches first.
- [ ] **Step 2:** On `http://localhost:8788/cards/go/`, check:
  - (a) The first Run shows the bar climbing through both parts to the full total, then `hello` output. The version reads `go1.22.12 · Yaegi v0.16.1`.
  - (b) `undefinedThing()` shows `2:15: undefined: undefinedThing` (adjust to the actual position).
  - (c) `for {}` then Stop gives "Stopped." within 1 s, and the next Run works.
  - (d) A nil-map write shows the panic under `stderr:`.
  - (e) Both experiments and the probes run. A reload serves the parts from cache, with no network fetch for `yaegi.wasm.part*`.
  - (f) In the built-in pane (no service worker) the bar is indeterminate, the notice appears, and code still runs.
- [ ] **Step 3:** Recheck that the C# card still works after Task 1's refactor: hello, a compile error, Stop.

### Task 6: Ship — wasm-dives, then words-for-the-unwise

**Files (words-for-the-unwise):**
- Modify: `src/lib/learnProxies.ts` (add `{ prefix: "/learn/go", origin: WASM_ORIGIN, base: "/cards/go" }`)
- Modify: `src/pages/learn/index.astro` (Go card: Go logo path, `#00add8`, keyline `#5dc9e2`, title "Go", blurb "Go in your browser", detail "Yaegi interpreter in WebAssembly.")
- Modify: `AGENTS.md` (`/learn` line lists Go)
- Test: `src/lib/learnProxies.test.ts`

- [ ] **Step 1: wasm-dives.** Push the branch and open a PR with a balanced body. Weakest points to list:
  - It's an interpreter: slower, with gaps.
  - Yaegi's last release was April 2024.
  - Docker is now required to build.
  - Splitting into parts adds one fetch per part.
  - The shared card-page refactor touches the C# card.
  Then run `codex exec -s read-only review --base origin/main`, address verified findings test-first, rebase-merge, and deploy (`npm run build && npx wrangler pages deploy dist --project-name wasm-dives --branch main`). Check `https://wasm-dives.pages.dev/cards/go/` end to end in Chromium.
- [ ] **Step 2: words-for-the-unwise, failing tests.**
  - `resolveLearnProxy("/learn/go/")` returns the Go rule.
  - `resolveLearnProxy("/learn/gopher")` returns `null`.
  - The no-`/run` rule still passes.
- [ ] **Step 3: Run** `npx vitest run src/lib/learnProxies.test.ts`. Expected: FAIL. Implement, then run `npm run verify`. Expected: zero type errors, all tests pass, the build completes.
- [ ] **Step 4: Ship.** Branch from `origin/main`, Codex review, PR, Copilot via REST. Wait for CI to pass, then rebase-merge.
- [ ] **Step 5: Verify live** in Chromium: `https://wordsfortheunwise.com/learn/` shows the Go card in Go blue, and `/learn/go/` runs `hello` with its runner iframe on `wasm-dives.pages.dev`.
