# AGENTS.md

## Intent

Show that everyday things really work in WebAssembly, in several languages,
entirely in the visitor's browser. Read the
[design spec](docs/superpowers/specs/2026-10-25-wasm-language-cards-design.md)
before non-trivial work.

## Hard rules

- Browser-only. Never compile or run user code on a server.
- User code runs in a dedicated Web Worker inside a runner page on the sandbox
  origin (`https://wasm-dives.pages.dev/run/`). Runner pages are never proxied
  onto wordsfortheunwise.com.
- Parent and runner check message origins against an allowlist in both
  directions.
- Every runtime file is pinned to an exact version and listed, with its
  SHA-384, in `dist/run/manifest.json`. The service worker refuses mismatches.
- Output reaches the DOM only through `textContent`.
- Nothing runs without a click.
- No language option may silently fall back to another language.
- COOP/COEP only on paths whose runtime needs them.

## Commands

```bash
npm test        # node:test, pure modules + site assertions
npm run build   # site/ -> dist/, vendor runtimes, manifest, sw.js
npm run dev     # wrangler pages dev on :8788 (cards: localhost, runner: 127.0.0.1)
```

## Workflow

Branch from `origin/main`, never commit to `main`. PR, then a cross-model
review (Claude-written code is reviewed by Codex:
`codex exec -s read-only review --base main`), then rebase merge.
