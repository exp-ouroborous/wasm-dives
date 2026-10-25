# Phase 1: Foundation + C# Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a C# language card at wordsfortheunwise.com/learn/csharp/. You type C#, press Run, and it compiles and runs in a sandboxed iframe on a separate origin, with a download progress bar, a Stop button and caching for later visits.

**Architecture:** In the new repo `wasm-dives`, a build step vendors the pinned WasmSharp npm package and writes a SHA-384 manifest. On the sandbox origin (`wasm-dives.pages.dev/run/`), a service worker serves the manifest files cache-first, verifies their hashes and broadcasts progress. A runner page bridges `postMessage` from the card page to a dedicated worker that runs WasmSharp. The card page is proxied by words-for-the-unwise at `/learn/csharp/`.

**Tech Stack:** Plain ES modules (no framework, no bundler), Node 26 `node:test`, `@wasmsharp/core@0.10.2`, Cloudflare Pages, Astro (words-for-the-unwise).

**Spec:** `docs/superpowers/specs/2026-10-25-wasm-language-cards-design.md`

## Global Constraints

- Browser-only: no server-side compile or run, ever.
- Sandbox origin: `https://wasm-dives.pages.dev`. Runner pages are embedded directly from it and never proxied.
- Allowed parent origins: `https://wordsfortheunwise.com`, `https://www.wordsfortheunwise.com`, `https://wasm-dives.pages.dev`, plus `http://localhost:8788` for local dev only.
- Local dev: card pages at `http://localhost:8788`, runner at `http://127.0.0.1:8788` (two different origins, same server).
- Pin `@wasmsharp/core` at exactly `0.10.2` (`"0.10.2"` in package.json, no caret).
- Every vendored runtime file is in `dist/run/manifest.json` with `size` and `sha384` (base64, as in SRI: `sha384-…`).
- Cloudflare Pages: no file over 25 MiB in `dist/` (the build fails if one is).
- Output goes into the DOM only through `textContent`.
- Nothing runs without a click on Run (or an experiment's / probe's own button).
- Card assets path: `/cards/wasm-assets/` upstream, `/learn/wasm-assets/` proxied.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never commit to `main`; rebase merge.

## Review Focus

1. **Service workers unavailable** (Firefox private mode, blocked storage): the runner must still run code, with an indeterminate progress bar and status "Progress and caching unavailable in this browser mode". Covered by the `chooseLoadStrategy` tests (Task 4).
2. **A download fails or corrupts mid-file** (network drop, hash mismatch): the runner shows "Download failed — press Run to retry" within the same session instead of hanging. A retry re-fetches. Covered by the `verifySha384` and `ProgressTracker.fail` tests (Task 3) and the runner reducer's `download-failed` tests (Task 4).
3. **Stop pressed while downloading or booting**, not just while running: the worker is terminated, state returns to `idle`, and the next Run boots again. Covered by the reducer tests (Task 4).
4. **Messages from an unexpected origin, or malformed messages**, in either direction are ignored silently. Covered by the `isAllowedOrigin` / `parseMessage` tests (Task 4) and the runner-client tests (Task 5).
5. **Huge finite output** (`for (int i=0;i<1e7;i++) Console.WriteLine(i);`): the display caps at 200,000 characters with a trailing `\n[output truncated]`. Covered by the `capOutput` test (Task 5).

---

### Task 1: Repo scaffold and manifest builder

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`, `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md`)
- Create: `scripts/manifest.mjs`
- Test: `tests/manifest.test.mjs`

**Interfaces:**
- Produces: `buildManifest(distDir: string, groups: Record<string, string[]>) => Promise<{ version: 1, groups: Record<string, { files: {path: string, size: number, sha384: string}[], totalBytes: number }> }>`. `groups` maps a language to directory prefixes relative to `distDir` (e.g. `{ csharp: ["run/vendor/wasmsharp/0.10.2"] }`); every file under a prefix is listed, and `path` is URL-style, starting `/run/...`.
- Produces: `assertPagesFileLimits(distDir: string, maxBytes = 25 * 1024 * 1024) => Promise<void>`, which throws naming the first oversized file.

- [ ] **Step 1: Scaffold.** `package.json`: `"type": "module"`; scripts `test: node --test tests/`, `build: node scripts/build.mjs`, `dev: npx wrangler pages dev dist --port 8788`; dependency `"@wasmsharp/core": "0.10.2"`. `.gitignore`: `node_modules/`, `dist/`, `.wrangler/`. `AGENTS.md`: project intent (spec link), browser-only rule, the security list from the spec, and the branch → PR → Codex review → rebase-merge workflow.
- [ ] **Step 2: Write failing tests** in `tests/manifest.test.mjs`. Use a temp dir holding `run/vendor/x/1.0.0/a.wasm` (bytes `"abc"`) and `run/vendor/x/1.0.0/sub/b.js`:
  - `buildManifest` lists both files under `groups.demo` with paths `/run/vendor/x/1.0.0/a.wasm` and `/run/vendor/x/1.0.0/sub/b.js`.
  - `a.wasm`'s `size === 3` and `sha384 === "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn"`.
  - `totalBytes` equals the sum of the sizes.
  - `assertPagesFileLimits(dir, 2)` rejects with a message containing `a.wasm`.
- [ ] **Step 3: Run** `npm test`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement** both functions in `scripts/manifest.mjs`, using `node:crypto` `createHash("sha384").digest("base64")` and recursive `readdir`. Sort files by path so the output is deterministic.
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit** on branch `feat/phase1-foundation` (`git checkout -b feat/phase1-foundation` after the scaffold's first commit lands on `main`. This is the one allowed initial commit on an empty repo; create `exp-ouroborous/wasm-dives` with `gh repo create exp-ouroborous/wasm-dives --public --source . --push` and configure it for rebase merges only: `gh repo edit --enable-rebase-merge --enable-merge-commit=false --enable-squash-merge=false`).

### Task 2: Vendor WasmSharp and prove it boots in our own worker (risk spike)

**Files:**
- Create: `runtimes.json`, `scripts/vendor.mjs`, `scripts/build.mjs`
- Create: `site/run/csharp/worker.js` (minimal for now)
- Test: `tests/vendor.test.mjs`

**Interfaces:**
- Consumes: `buildManifest`, `assertPagesFileLimits` (Task 1).
- Produces: `runtimes.json` shaped `{ "csharp": { "package": "@wasmsharp/core", "version": "0.10.2", "vendorDir": "run/vendor/wasmsharp/0.10.2", "exclude": ["cs","de","es","fr","it","ja","ko","pl","pt-BR","ru","tr","zh-Hans","zh-Hant"] } }`. `exclude` lists the top-level localized-resource directories inside the package; they're dropped.
- Produces: `vendorRuntime(nodeModulesDir: string, distDir: string, spec) => Promise<string[]>`, which copies the package (minus `exclude`) into `distDir/spec.vendorDir` and returns the relative paths copied.
- Produces: `npm run build`, which copies `site/` to `dist/`, vendors every runtime, writes `dist/run/manifest.json`, then runs `assertPagesFileLimits`.

- [ ] **Step 1: Write failing tests:** `vendorRuntime` against a fake package dir containing `de/x.resources.dll`, `_framework/dotnet.wasm` and `index.js` copies `_framework/dotnet.wasm` and `index.js`, not `de/x.resources.dll`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `vendorRuntime` and `scripts/build.mjs`.
- [ ] **Step 4: Run** `npm test`, then `npm ci && npm run build`. Expected: tests PASS; `dist/run/manifest.json` exists with `groups.csharp.totalBytes` > 0; no file in `dist/` is over 25 MiB.
- [ ] **Step 5: Spike.** In `site/run/csharp/worker.js`, import WasmSharp from `../vendor/wasmsharp/0.10.2/<entry>`, using the package's `module`/`exports` entry from its package.json. Call `WasmSharpModule.initializeAsync({ disableWebWorker: true })` and compile and run `Console.WriteLine("hello from C#");`, posting `{ stdout }` back. Serve with `npm run dev`, load a throwaway `site/run/csharp/spike.html` that creates the worker, and check in the browser pane that `hello from C#` arrives.
  - **Gate:** if WasmSharp cannot boot inside our dedicated worker, stop and report back before Task 3. The fallback is WasmSharp's own worker mode with Stop implemented as iframe reload, which changes Task 4's design. Delete `spike.html` before committing.
- [ ] **Step 6: Commit.**

### Task 3: Verifying, caching service worker with progress

**Files:**
- Create: `site/run/sw-core.mjs` (pure helpers), `site/run/sw.js` (wiring)
- Test: `tests/sw-core.test.mjs`

**Interfaces:**
- Consumes: the `dist/run/manifest.json` shape (Task 1).
- Produces: `indexManifest(manifest) => Map<string /* path */, {size, sha384, group}>`.
- Produces: `verifySha384(bytes: ArrayBuffer, expected: string) => Promise<boolean>` (uses `crypto.subtle`).
- Produces: `class ProgressTracker { constructor(totalBytes: number); add(n: number): {loaded, total}; fail(path: string): {failed: path}; }`.
- Produces: broadcasts on `BroadcastChannel("wasm-dives-progress")`: `{ type: "progress", group, loaded, total, path }`, `{ type: "download-failed", group, path }`.
- `sw.js` behaviour: `install` → `skipWaiting()`; `activate` → `clients.claim()` and delete caches not named `wasm-dives-<manifestSha>`. `fetch` for a manifest path: return the cached copy if present (counting its full size as progress); otherwise stream the network body, counting bytes as they arrive, buffer it, verify, `cache.put`, and respond. On a hash mismatch or network error, broadcast `download-failed` and respond 502. Other requests pass through. Progress counts **decoded** bytes, because the body stream is already decompressed. That matches the manifest's uncompressed sizes, so the bar's total (about 35 MB for C#) is larger than what actually crosses the network (about 15 MB). The card says "unpacked size" next to the total.

- [ ] **Step 1: Write failing tests:**
  - `verifySha384(bytes("abc"), "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn")` → `true`; with one byte changed → `false`.
  - `indexManifest` maps each path to its group.
  - A `ProgressTracker(10)` given `add(4)` and then `add(6)` returns `{loaded: 10, total: 10}`; `fail("/run/x")` returns `{failed: "/run/x"}`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `sw-core.mjs`, then the wiring in `site/run/sw.js`. Module service workers aren't reliable across browsers, so register a **classic** worker. `scripts/build.mjs` writes `dist/run/sw.js` as the contents of `sw-core.mjs` with its `export` keywords stripped, followed by `site/run/sw.js`. Tests import `sw-core.mjs` directly. Add a build test asserting that `dist/run/sw.js` contains no `export ` and no `import `.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 4: Runner page, protocol and worker lifecycle

**Files:**
- Create: `site/run/shared/protocol.mjs`, `site/run/shared/runner-state.mjs`, `site/run/shared/runner-host.mjs`
- Create: `site/run/csharp/index.html`; finish `site/run/csharp/worker.js`
- Test: `tests/protocol.test.mjs`, `tests/runner-state.test.mjs`

**Interfaces:**
- Produces (`protocol.mjs`):
  - `PROTOCOL = "wasm-dives/1"`
  - `ALLOWED_PARENT_ORIGINS` (from Global Constraints)
  - `isAllowedOrigin(origin: string, allowed = ALLOWED_PARENT_ORIGINS) => boolean`
  - `parseMessage(data: unknown) => {type, ...} | null`, which accepts only objects with `protocol === PROTOCOL` and a known `type`.
  - Parent → runner types: `run {id: string, source: string}`, `stop {}`.
  - Runner → parent types: `phase {phase: "idle"|"downloading"|"starting"|"ready"|"running"}`, `progress {loaded: number, total: number | null}`, `result {id, ok: boolean, stdout: string, diagnostics: {id, message, severity, start, end}[], ms: number}`, `error {id?: string, message: string}`, `runtime {language: "csharp", version: string}`.
- Produces (`runner-state.mjs`): `runnerReducer(state, event) => state`, with `state = {phase, pendingRunId: string|null, error: string|null}`. Events: `run-requested`, `download-progress`, `download-failed`, `booted`, `result`, `stop-requested`.
  - `stop-requested` from any phase → `{phase: "idle", pendingRunId: null, error: null}`.
  - `download-failed` → `{phase: "idle", error: "Download failed — press Run to retry"}`.
- Produces (`runner-state.mjs`): `chooseLoadStrategy({hasServiceWorker: boolean}) => "service-worker" | "direct"`.
- `runner-host.mjs`:
  - Registers `../sw.js` (scope `/run/`) and waits for `controller` before creating the worker.
  - Listens on the progress `BroadcastChannel` and forwards `progress`.
  - Creates `worker.js` lazily on the first `run`.
  - On `stop`, calls `worker.terminate()` and sets the worker to `null`.
  - Posts messages only to `event.origin` values that passed `isAllowedOrigin`.
  - Under the `direct` strategy, sends `progress {loaded: 0, total: null}` (indeterminate) and the status text "Progress and caching unavailable in this browser mode".
- Worker protocol (runner-host ↔ worker): `{type:"run", id, source}` → `{type:"result", id, ok, stdout, diagnostics, ms}`; it posts `{type:"booted", version}` once WasmSharp is initialised. The version comes from running `System.Environment.Version` once at boot.

- [ ] **Step 1: Write failing tests:**
  - `isAllowedOrigin("https://wordsfortheunwise.com") === true`, `isAllowedOrigin("https://evil.example") === false`, `isAllowedOrigin("null") === false`.
  - `parseMessage({protocol: "wasm-dives/1", type: "run", id: "1", source: "x"})` returns the object. `parseMessage({type: "run"})`, `parseMessage("run")` and an unknown `type` return `null`.
  - Reducer: `stop-requested` from each of `downloading`, `starting` and `running` → `idle` with `pendingRunId === null`. `download-failed` → `idle` with the exact error string above. `run-requested` from `idle` → `downloading` with `pendingRunId` set.
  - `chooseLoadStrategy({hasServiceWorker: false}) === "direct"`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the three modules, `index.html` (no visible UI beyond a `<noscript>` line) and `worker.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Card shell — runner client, progress bar, output

**Files:**
- Create: `site/cards/wasm-assets/runner-client.mjs`, `site/cards/wasm-assets/format.mjs`, `site/cards/wasm-assets/card.css`
- Test: `tests/runner-client.test.mjs`, `tests/format.test.mjs`

**Interfaces:**
- Consumes: `PROTOCOL` and the message types (Task 4). `runner-client.mjs` keeps its own copy of the two constants it needs (`PROTOCOL`, the runner origin), because cards and runners are served from different origins and must not import across them.
- Produces:
  - `runnerOrigin(location: {hostname, port}) => string`: `"http://127.0.0.1:<port>"` when the hostname is `localhost`, otherwise `"https://wasm-dives.pages.dev"`.
  - `createRunnerClient({ iframe: HTMLIFrameElement, origin: string, win = window }) => { run(source: string): Promise<Result>; stop(): void; onPhase(cb); onProgress(cb); onRuntime(cb) }`. `run` assigns `id = crypto.randomUUID()` and resolves on the `result` whose `id` matches. `stop()` rejects any pending run with `Error("stopped")`. Messages whose `event.origin !== origin` or `event.source !== iframe.contentWindow` are ignored.
  - `formatBytes(n) => string` (`"0 B"`, `"1.5 KB"`, `"14.6 MB"`).
  - `formatProgress({loaded, total}) => string` (`"3.2 / 14.6 MB"`, or `"3.2 MB"` when `total` is null).
  - `capOutput(text, max = 200_000) => string` (appends `"\n[output truncated]"` when cut).
  - `formatDiagnostics(diags) => string` (one line each: `"CS0103 (3–12): The name 'WriteLine' does not exist…"`).

- [ ] **Step 1: Write failing tests:**
  - The exact `formatBytes` and `formatProgress` strings above.
  - `capOutput("x".repeat(200_001)).endsWith("\n[output truncated]")`, and its length is `200_000 + 19`.
  - `runnerOrigin({hostname: "localhost", port: "8788"}) === "http://127.0.0.1:8788"`.
  - Runner client with a fake `win` (an EventTarget) and a fake iframe: a `result` from the wrong origin does not resolve `run`; one with the right origin and source but a different `id` does not; a matching one resolves with `{ok, stdout}`; `stop()` rejects a pending run with `"stopped"`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** `card.css` follows the existing dive look: blue/white, Inter, matching the "dive" theme in words-for-the-unwise `src/pages/learn/index.astro`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 6: The C# card page

**Files:**
- Create: `site/cards/csharp/index.html`, `site/cards/csharp/card.mjs`, `site/cards/csharp/programs.mjs`
- Test: `tests/csharp-card.test.mjs`

**Interfaces:**
- Consumes: `createRunnerClient`, `runnerOrigin`, the format helpers (Task 5).
- Produces (`programs.mjs`):
  - `SCRATCHPAD_DEFAULT`: hello world plus a LINQ one-liner.
  - `EXPERIMENTS`: `[{ id: "linq-csv", title: "LINQ over a CSV", source }, { id: "records", title: "Records and pattern matching", source }]`.
  - `PROBE_SOURCE`: prints `Environment.Version`, `RuntimeInformation.OSDescription`, `RuntimeInformation.ProcessArchitecture`, `Environment.ProcessorCount`, `GC.GetTotalMemory(false)`, and the milliseconds a 10-million-iteration loop takes, as `key: value` lines.
- Page regions:
  - Header with "C# in your browser" and the line "Real C# compiled by Roslyn, running on .NET WebAssembly — nothing leaves the page."
  - **Runtime** panel: phase text, a `<progress>` element (no `value` attribute while indeterminate), byte text and the .NET version once known.
  - **Scratchpad:** textarea, Run, Stop, output `<pre>`.
  - **Experiments:** one button per experiment, sharing an output `<pre>`.
  - **Probes:** a button and a `<pre>`.
  - The iframe (`sandbox="allow-scripts allow-same-origin"`, hidden, `src` = `runnerOrigin(location) + "/run/csharp/"`).
- Every Run button is disabled while a run is pending; Stop is enabled only then.

- [ ] **Step 1: Write the failing site test,** mirroring pyiodide-dives' `tests/site.test.mjs` style (read files, regex asserts):
  - `index.html` contains `C# in your browser`, `id="scratchpad"`, `id="experiments"`, `id="probes"`, `<progress`, and `sandbox="allow-scripts allow-same-origin"`.
  - It contains no `innerHTML`.
  - `card.mjs` contains no `innerHTML`.
  - `programs.mjs` exports `EXPERIMENTS` with 2 entries.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the page and `card.mjs`. Wire the runner client to the regions; render diagnostics with `formatDiagnostics` when `ok` is false.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Verify in the browser pane** (`npm run build && npm run dev`, open `http://localhost:8788/cards/csharp/`):
  - (a) First Run shows bytes climbing to the total, then "starting", then `hello` output.
  - (b) A deliberate compile error shows `CS0103`.
  - (c) `while(true){}` followed by Stop returns to idle within 1 s, and the next Run works.
  - (d) After a reload, Run reaches ready with no network fetches for vendor files (check the network panel).
  - (e) In a private window with service workers blocked, the indeterminate bar and the status line appear, and code still runs.
  Save screenshots to `.local/testing/`.
- [ ] **Step 6: Commit.**

### Task 7: Headers, deploy and wasm-dives PR

**Files:**
- Create: `site/_headers`, `DEPLOY.md`

**Interfaces:**
- `_headers`:
  - `/run/*` → `Content-Security-Policy: frame-ancestors https://wordsfortheunwise.com https://www.wordsfortheunwise.com https://wasm-dives.pages.dev http://localhost:8788`
  - `/run/vendor/*` → `Cache-Control: public, max-age=31536000, immutable`
  - `/run/sw.js` → `Cache-Control: no-cache`
  - No COOP/COEP anywhere in this phase.

- [ ] **Step 1: Write a failing test** in `tests/headers.test.mjs`: `_headers` contains the exact `frame-ancestors` line and does not match `/Cross-Origin-Embedder-Policy/`.
- [ ] **Step 2: Run, implement, run.** Expected: FAIL, then PASS.
- [ ] **Step 3: Create the Pages project and deploy:** `npx wrangler pages project create wasm-dives --production-branch main`, then `npm run build && npx wrangler pages deploy dist --project-name wasm-dives --branch main`. Document in `DEPLOY.md` that Git-integrated builds (`npm ci && npm run build`, output `dist`) are an owner dashboard step.
- [ ] **Step 4: Verify directly:** `curl -sI https://wasm-dives.pages.dev/run/csharp/` shows the `frame-ancestors` header. `https://wasm-dives.pages.dev/cards/csharp/` works end to end (checks a–c from Task 6) in the browser pane.
- [ ] **Step 5: Review and merge:** push `feat/phase1-foundation`, open the PR with a balanced body (weakest points: the single-maintainer WasmSharp, service-worker control of dedicated workers, the untested Safari path), run `codex exec -s read-only review --base main`, address verified findings, then `gh pr merge --rebase`.

### Task 8: words-for-the-unwise — proxy C# card and split /learn into rows

**Files:**
- Create: `src/lib/learnProxies.ts`
- Modify: `src/middleware.ts:10-23` (import `resolveLearnProxy`; the inline `PROXIES` table moves out)
- Modify: `src/pages/learn/index.astro` (two sections: "languages" with Python → `/learn/pyodide/` and C# → `/learn/csharp/`; "tools" with the four tool cards)
- Modify: `AGENTS.md` (`/learn` product-map line: language cards proxied from wasm-dives; runners on a separate origin)
- Test: `src/lib/learnProxies.test.ts`

**Interfaces:**
- Produces: `LEARN_PROXIES` (the existing entries plus `{ prefix: "/learn/csharp", origin: "https://wasm-dives.pages.dev", base: "/cards/csharp" }` and `{ prefix: "/learn/wasm-assets", origin: "https://wasm-dives.pages.dev", base: "/cards/wasm-assets" }`).
- Produces: `resolveLearnProxy(pathname: string) => { prefix: string, origin: string, base: string } | null` (the same matching rule as today: exact prefix, or prefix + `/`).
- Never adds a proxy for `/run/`.

- [ ] **Step 1: Write failing tests:**
  - `resolveLearnProxy("/learn/csharp/")` → the csharp rule.
  - `resolveLearnProxy("/learn/csharpx")` → `null`.
  - `resolveLearnProxy("/learn/wasm-assets/card.css")` → the wasm-assets rule.
  - `resolveLearnProxy("/learn/assets/x")` still maps to `https://misc-dives.pages.dev`.
  - No rule's `base` starts with `/run`.
- [ ] **Step 2: Run** `npx vitest run src/lib/learnProxies.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement,** move the table and update `middleware.ts` to call `resolveLearnProxy`. Update `index.astro` with a "languages" label above the language row (C# card: chip `cs`, title "C#", blurb "C# in your browser", detail "Roslyn on .NET WebAssembly.") and a "tools" label above the existing four.
- [ ] **Step 4: Run** `npm run verify`. Expected: zero type errors; all tests pass; the build completes.
- [ ] **Step 5: Ship:** branch `feat/learn-csharp-card` from `origin/main`, Codex review, docs sweep, PR, Copilot request via REST, rebase merge.
- [ ] **Step 6: Verify live:** `https://wordsfortheunwise.com/learn/` shows two rows; `/learn/csharp/` loads and runs `hello` end to end, with the runner iframe's origin shown as `wasm-dives.pages.dev` in the network panel.
