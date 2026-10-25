# wasm-dives

Language cards for [words for the unwise /learn](https://wordsfortheunwise.com/learn/):
type real code in a language and run it entirely in your browser, compiled or
interpreted in WebAssembly.

- `site/cards/<lang>/`: card pages, reverse-proxied at `/learn/<lang>/`.
- `site/run/<lang>/`: sandbox runners, embedded straight from
  `wasm-dives.pages.dev` so user code never runs on the main site's origin.
- `runtimes/csharp/`: our C# runtime, Roslyn hosted on .NET WebAssembly and
  compiling against the full .NET 10 reference assemblies (needs the .NET SDK
  in its `global.json` to build).
- `npm run build`: vendors the pinned runtimes into `dist/` and writes a SHA-384
  manifest that the sandbox service worker checks every download against.

Design: [docs/superpowers/specs/2026-10-25-wasm-language-cards-design.md](docs/superpowers/specs/2026-10-25-wasm-language-cards-design.md).
