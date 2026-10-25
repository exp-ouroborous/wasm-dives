# Phase 6c: Markdown to HTML in every language

> Executed natively (superpowers:executing-plans), same pattern as phase 6a
> (regex) and 6b (JSON).

**Goal:** the Markdown tool converts Markdown to HTML with a real Markdown
library in Python, C#, Go and C/C++, chosen on the page, each running in the
wasm-dives sandbox. Missing features are shown disabled and refused by the
engine, never silently ignored.

**Spec:** `docs/superpowers/specs/2026-10-25-wasm-language-cards-design.md`
(tool cards, "every tool offers every language", security rules).

## Libraries (pinned, each released at least two weeks before 2026-10-25)

| Language | Library | Version | How it reaches the browser |
|---|---|---|---|
| Python | Python-Markdown | 3.11 | wheel vendored into `run/vendor/python-wheels/`, listed in the manifest (SHA-384), loaded with `pyodide.loadPackage(url)` |
| Python | bleach (safe mode) | 6.3.0 | Pyodide lock file (already checksum-verified) |
| C# | Markdig | 1.4.0 | `PackageReference` in the runner; its image embedded so Roslyn can reference it |
| Go | goldmark | v1.8.6 | compiled into the Yaegi wasm; symbols generated with `yaegi extract` and committed |
| C/C++ | md4c | v0.6.0 | C sources vendored in `runtimes/md4c/` (with LICENSE), copied to `run/vendor/md4c/0.6.0/`, compiled with the engine |

Python-Markdown is not CommonMark; the other three are. Outputs differ in
detail; the contract checks structure, not byte-identical HTML.

## Contract

Input `{source, features: string[], safe: boolean}`.
Output `{ok, engine, html, error}`; when a requested feature is not available:
`{ok:false, unsupported:true, unsupported_features:[...], error:"<feature> is not available in <language>"}`.

Features and support (single source: `site/cards/wasm-assets/markdown-features.mjs`,
imported by both the page and the contract test):

| feature | python | csharp | go | cpp |
|---|---|---|---|---|
| `fenced_code` | toggle | always on | always on | always on |
| `tables` | yes | yes | yes | yes |
| `hard_breaks` (nl2br) | yes | yes | yes | yes |
| `footnotes` | yes | yes | yes | no |
| `smarty` (typographic quotes) | yes | yes | yes | no |
| `toc` | yes | no | no | no |
| `sane_lists` | yes | no | no | no |
| `extra` | yes | no | no | no |

`safe`: Python cleans with bleach; Markdig `DisableHtml()`; goldmark without
`WithUnsafe()`; md4c `MD_FLAG_NOHTML`. Either way no raw `<script>` or event
handler attribute survives. The preview iframe stays `sandbox=""`.

Engine names: "Python-Markdown 3.11", "Markdig 1.4.0", "goldmark v1.8.6",
"md4c 0.6.0".

## Tasks

1. **Contract + Python.** `tests/engines/markdown-cases.json`,
   `markdown-contract.mjs` (contains / not_contains / matches assertions;
   unsupported features derived from the capability table). Vendor the
   Markdown wheel (`scripts/` fetch with pinned SHA-256 from PyPI, then into
   the manifest). `engines/markdown.py`; the Python worker loads an engine's
   packages before running it (`REQUIRES = ["markdown", "bleach"]`-style
   declaration read from the engine file).
2. **C#.** Markdig reference + embedded image; `LoadEngine` and the
   scratchpad compilation both reference it. `engines/markdown.cs`.
3. **Go.** goldmark in `runtimes/go/go.mod`; `yaegi extract` symbols for
   `goldmark`, `goldmark/extension`, `goldmark/renderer/html`; `i.Use` them.
   `engines/markdown.go`.
4. **C/C++.** md4c sources vendored; `engine-host.mjs` gains per-engine
   library files and argv for markdown (`source`, `features` csv, `safe`);
   worker and test host compile `-x c <md4c files> -x c++ engine.cc`.
   `engines/markdown.cc`.
5. **misc-dives page.** Picker, View source, Stop; feature checkboxes
   disabled per language (with "always on" for CommonMark fences); safe mode
   label says how each language does it; `tool.py` and micropip removed.
6. **Ship.** Codex review per repo, PRs, rebase merge, deploy wasm-dives then
   misc-dives, live check, `/learn` Markdown card copy.

## Review focus

- A feature the page offers but the engine ignores (the "silent fallback" rule).
- Safe mode letting `<script>`, `onerror=`, or `javascript:` through.
- Very large or deeply nested input (md4c and goldmark are linear; Python-Markdown is not).
- Non-ASCII and emoji in headings, code and tables.
- Runtime size: the C# runner and Go wasm grow; parts splitting must still apply.
