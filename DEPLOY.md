# Deploying wasm-dives

Cloudflare Pages project `wasm-dives`, served at `https://wasm-dives.pages.dev`.

## Build

```bash
npm ci
npm run build      # -> dist/ (site, vendored runtimes, manifest, sw.js)
```

The build needs the .NET SDK pinned in `runtimes/csharp/global.json`
(10.0.100, no workloads): it publishes `runtimes/csharp/` (Roslyn on .NET
WebAssembly) into `dist/run/vendor/csharp-runner/<content hash>/`.

The build fails if any file in `dist/` exceeds Cloudflare Pages' 25 MiB limit.

## First-time setup (owner)

```bash
npx wrangler pages project create wasm-dives --production-branch main
```

Git-integrated builds are a dashboard step: connect the GitHub repo
`exp-ouroborous/wasm-dives`, with build command `npm ci && npm run build` and
output directory `dist`. Cloudflare's build image has no .NET SDK, so that
build command would first need to install the pinned SDK; deploys are manual
for now.

## Manual deploy

```bash
npm run build
npx wrangler pages deploy dist --project-name wasm-dives --branch main
```

## How words-for-the-unwise uses it

- `/learn/<lang>/` on wordsfortheunwise.com reverse-proxies `/cards/<lang>/`,
  and `/learn/wasm-assets/` proxies `/cards/wasm-assets/` (see that repo's
  `src/lib/learnProxies.ts`).
- `/run/` is **never** proxied. Card pages embed
  `https://wasm-dives.pages.dev/run/<lang>/` in an iframe so user code runs on
  this separate origin. `_headers` limits who may frame it (`frame-ancestors`).

## Checks after a deploy

```bash
curl -sI https://wasm-dives.pages.dev/run/csharp/ | grep -i content-security-policy
curl -s https://wasm-dives.pages.dev/run/manifest.json | head -c 200
```

Then open `https://wordsfortheunwise.com/learn/csharp/` and press Run.
