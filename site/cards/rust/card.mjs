import { startLanguageCard } from "../wasm-assets/card-page.mjs";
import * as programs from "./programs.mjs";

startLanguageCard({
  language: "rust",
  runtimeLabel: "Rust",
  phaseText: {
    idle: "Not loaded yet — press Run to download Miri and the Rust standard library.",
    downloading: "Downloading Miri and the Rust standard library…",
    starting: "Starting Miri…",
    ready: "Ready.",
    running: "Interpreting…",
  },
  programs,
});
