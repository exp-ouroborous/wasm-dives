import { startLanguageCard } from "../wasm-assets/card-page.mjs";
import * as programs from "./programs.mjs";

startLanguageCard({
  language: "go",
  runtimeLabel: "Go",
  phaseText: {
    idle: "Not loaded yet — press Run to download the Go interpreter.",
    downloading: "Downloading the Go interpreter (Yaegi)…",
    starting: "Starting Go…",
    ready: "Ready.",
    running: "Running…",
  },
  programs,
});
