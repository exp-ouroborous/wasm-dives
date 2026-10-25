import { startLanguageCard } from "../wasm-assets/card-page.mjs";
import * as programs from "./programs.mjs";

const dialect = document.querySelector("#dialect");
const input = document.querySelector("#scratchpad-input");
const DEFAULTS = { cpp: programs.SCRATCHPAD_DEFAULT, c: programs.SCRATCHPAD_DEFAULT_C };

startLanguageCard({
  language: "cpp",
  runtimeLabel: "C/C++",
  phaseText: {
    idle: "Not loaded yet — press Run to download the C/C++ compiler.",
    downloading: "Downloading Clang, LLD and the C/C++ libraries…",
    starting: "Starting Clang…",
    ready: "Ready.",
    running: "Compiling and running…",
  },
  programs,
  scratchpadOptions: () => ({ dialect: dialect.value }),
});

// Switching language swaps in that language's example, unless it was edited.
let shown = dialect.value;
dialect.addEventListener("change", () => {
  if (input.value === DEFAULTS[shown]) input.value = DEFAULTS[dialect.value];
  shown = dialect.value;
});
