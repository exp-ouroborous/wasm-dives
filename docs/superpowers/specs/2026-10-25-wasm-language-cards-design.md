# WASM language cards for /learn — design

Status: agreed in conversation on 2026-10-25. The owner skipped the remaining
design questions ("go all the way"), so decisions marked *(call)* were made by
the author of this document and are open to challenge.

## Intent

Show that everyday things really work in WebAssembly, in each of several
languages, entirely in the visitor's browser. It is a showcase of what is
possible — not a benchmark, not a language comparison, not a tutorial.

## Shape

`/learn` on wordsfortheunwise.com gets two rows:

1. **Language cards (top row).** One card per language. Each opens a page
   with the same shape as today's Pyodide dive: a runtime panel (status and a
   download progress bar), a scratchpad where you type and run your own code,
   a couple of hands-on experiments, and runtime probes.
2. **Tool cards (below).** Regex tester, JSON pretty printer, Markdown to
   HTML, text diff. You pick a tool, then a language; the tool runs on an
   engine written in that language and compiled to WASM ahead of time.

## Branding

Every place a language appears wears that language's own colour and logo:
its card on `/learn`, its card page, and each option in a tool's language
picker (the dropdown is a coloured logo plus the name, not plain text). One
shared table, `site/cards/wasm-assets/languages.mjs` (label, colour, darker
shade, keyline, logo path), feeds all of them; the tools import it through
`/learn/wasm-assets/`. Logos are CC0 paths from simple-icons. C# has no CC0
logo there, so it uses .NET's logo and purple *(call)*, since the card runs
Roslyn on .NET.

## Languages

| Language | Runtime (scratchpad) | Notes |
|---|---|---|
| Python | Pyodide (existing dive) | moves onto the sandbox runner in a later phase |
| C# | WasmSharp `@wasmsharp/core@0.10.2` (Roslyn on .NET WASM) | ~15 MB gzipped; single maintainer — pinned and self-hosted |
| Go | Yaegi v0.16.1 (Go interpreter) built from source to WebAssembly by us | Owner decision 2026-10-25: GopherJS compiles Go to JavaScript, not WASM, so it is out. ~37 MB raw (~5–8 MB compressed), split into parts to fit Pages. The card says it is an interpreter with Go 1.22-era gaps (no `min`/`max`, no generic stdlib functions such as `slices.Sort`, no inference for two type parameters) and runs slower than compiled Go |
| C/C++ | YoWASP Clang `@yowasp/clang` (pinned) | ~25 MB compressed; upstream archived 2026-03 — pin, mirror if needed; largest files exceed Pages' 25 MiB, so loaded from jsDelivr with verified hashes |
| Rust | rubrc (real rustc, WASI) | **Experimental** label; ~60 MB; needs COOP/COEP; author says not production-ready |

Out: Java, Kotlin (owner decision), anything needing a server-side compile.

## Goals

- Every language card lets you type code and run it, fully in the browser.
- A progress bar whenever a large download happens (bytes fetched / total,
  then a "starting…" phase).
- Big downloads are cached after the first visit.
- Every tool card offers every language.

## Non-goals

- Benchmarks or rankings between languages.
- Teaching the languages.
- Sharing code via links, or loading other people's code.

## Anti-goals

- A language option that silently falls back to Python or JavaScript. If the
  picker says Go, Go is running. A feature not yet built in a language is
  shown disabled with a label, never faked.
- Server-side compilation or execution of any kind.

## Constraints

- Browser-only. No compile or run APIs on any server.
- Cloudflare Pages limits: 25 MiB per file, 20,000 files per deployment.
- jsDelivr: 150 MB per npm package.
- Each repo: branch from `origin/main`, PR, cross-model (Codex) review,
  rebase merge (see words-for-the-unwise DEVELOPMENT.md).

## Security (agreed; applies even with no sharing)

- User code runs in a dedicated Web Worker; **Stop** terminates the worker.
- Scratchpads run in an iframe on a **separate origin**
  (`https://wasm-dives.pages.dev`), so user code cannot act as
  wordsfortheunwise.com or reach its storage and APIs. *(call)* The iframe
  uses `sandbox="allow-scripts allow-same-origin"`: `allow-same-origin` only
  grants the iframe its own (pages.dev) origin, and is needed so it can run
  workers, a service worker and Cache Storage. Without it the origin is
  opaque and caching is impossible.
- Parent ↔ runner messages are checked against an origin allowlist in both
  directions.
- Every runtime file is pinned to an exact version and verified against a
  SHA-384 hash recorded at build time. The existing Pyodide loads get the same
  treatment in a later phase.
- COOP/COEP headers only where a runtime needs them (Rust), scoped to those
  paths, never site-wide on wordsfortheunwise.com.
- Nothing runs automatically; code runs only on the Run button.
- Output is written with `textContent`, never as HTML.

## Architecture *(call)*

- New repo `exp-ouroborous/wasm-dives`, deployed to Cloudflare Pages project
  `wasm-dives`.
  - `/cards/<lang>/` — card pages, reverse-proxied by words-for-the-unwise at
    `/learn/<lang>/` (same pattern as the existing dives). Shared card assets
    live at `/cards/wasm-assets/`, proxied at `/learn/wasm-assets/` (the
    existing `/learn/assets/` belongs to misc-dives).
  - `/run/<lang>/` — runner pages, embedded directly from
    `wasm-dives.pages.dev` (never proxied), so they keep the separate origin.
  - `/run/sw.js` — a service worker on the sandbox origin. It serves every
    runtime file listed in the build-time manifest: cache-first, hash-verified,
    and it broadcasts byte progress. This works whichever library does the
    fetching (WasmSharp, for example, loads its own files).
- A build step (`npm run build`) vendors pinned npm runtimes into
  `dist/run/vendor/<name>/<version>/` and writes `dist/run/manifest.json`
  (path, size and sha384 per file, grouped by language).
- If service workers are unavailable (some private-browsing modes), the runner
  still works, with an indeterminate progress bar and no cache.

## Phases

Each phase ships on its own and gets its own plan once the previous phase has
landed.

1. **Foundation + C# card.** wasm-dives repo, service worker, runner protocol,
   card shell, C# card, `/learn/csharp/` proxy, `/learn` index split into
   language and tool rows.
2. **Go card** (Yaegi compiled to WASM, split into parts).
3. **C/C++ card** (YoWASP Clang, jsDelivr-hosted files through the same
   verifying service worker).
4. **Python card onto the sandbox runner.** The Pyodide scratchpad moves into
   the sandbox, and the remaining Pyodide loads get pinned hashes.
5. **Rust card (experimental)**, with COOP/COEP scoped to its paths.
6. **Tool cards, multi-language**, one tool at a time (regex first). The
   ahead-of-time engines are built per language in misc-dives, with a language
   picker on each tool page.
