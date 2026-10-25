import { startLanguageCard } from "../wasm-assets/card-page.mjs";
import * as programs from "./programs.mjs";

startLanguageCard({
  language: "python",
  runtimeLabel: "Python",
  phaseText: {
    idle: "Not loaded yet — press Run to download Python.",
    downloading: "Downloading CPython and its standard library…",
    starting: "Starting Python…",
    ready: "Ready.",
    running: "Running…",
  },
  programs,
});
