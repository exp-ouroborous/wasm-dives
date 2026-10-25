import { startLanguageCard } from "../wasm-assets/card-page.mjs";
import * as programs from "./programs.mjs";

startLanguageCard({
  language: "csharp",
  runtimeLabel: "C#",
  phaseText: {
    idle: "Not loaded yet — press Run to download the C# runtime.",
    downloading: "Downloading the C# compiler and .NET runtime…",
    starting: "Starting .NET…",
    ready: "Ready.",
    running: "Running…",
  },
  programs,
});
