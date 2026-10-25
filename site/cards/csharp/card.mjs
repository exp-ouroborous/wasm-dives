import { createRunnerClient, runnerOrigin } from "../wasm-assets/runner-client.mjs";
import { formatProgress, formatRunResult } from "../wasm-assets/format.mjs";
import { EXPERIMENTS, PROBE_SOURCE, SCRATCHPAD_DEFAULT } from "./programs.mjs";

const $ = (selector) => document.querySelector(selector);
const PHASE_TEXT = {
  idle: "Not loaded yet — press Run to download the C# runtime.",
  downloading: "Downloading the C# compiler and .NET runtime…",
  starting: "Starting .NET…",
  ready: "Ready.",
  running: "Running…",
};

const origin = runnerOrigin(location);
const iframe = $("#runner");
iframe.src = `${origin}/run/csharp/`;
const client = createRunnerClient({ iframe, origin });

const status = $("#runtime-status");
const progress = $("#runtime-progress");
const runButtons = [];
const stop = $("#scratchpad-stop");

function setStatus(text, kind = "ok") {
  status.textContent = text;
  status.dataset.kind = kind;
}

function setBusy(busy) {
  for (const button of runButtons) button.disabled = busy;
  stop.disabled = !busy;
}

async function runInto(output, source) {
  setBusy(true);
  output.textContent = "Running…";
  try {
    output.textContent = formatRunResult(await client.run(source));
  } catch (error) {
    output.textContent = error.message === "stopped" ? "Stopped." : error.message;
    if (error.message !== "stopped") setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

let started = false;
client.onPhase((phase) => {
  const text = phase === "idle" && started ? "Stopped — the next Run restarts the C# runtime." : PHASE_TEXT[phase];
  started ||= phase !== "idle";
  setStatus(text ?? phase);
  if (phase === "ready" || phase === "running") progress.value = progress.max;
  if (phase === "idle") progress.value = 0;
});
client.onProgress(({ loaded, total }) => {
  if (total) {
    progress.max = total;
    progress.value = Math.min(loaded, total);
  } else {
    progress.removeAttribute("value");
  }
  $("#runtime-bytes").textContent = `${formatProgress({ loaded, total })} unpacked`;
});
client.onRuntime(({ version }) => {
  $("#runtime-version").textContent = version || "unknown";
});
client.onNotice((message) => {
  const notice = $("#runtime-notice");
  notice.textContent = message;
  notice.hidden = false;
});

const input = $("#scratchpad-input");
input.value = SCRATCHPAD_DEFAULT;
const runScratchpad = $("#scratchpad-run");
runButtons.push(runScratchpad);
runScratchpad.addEventListener("click", () => runInto($("#scratchpad-output"), input.value));
stop.addEventListener("click", () => client.stop());

const experimentOutput = $("#experiment-output");
for (const experiment of EXPERIMENTS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = experiment.title;
  button.addEventListener("click", () => {
    $("#experiment-blurb").textContent = experiment.blurb;
    runInto(experimentOutput, experiment.source);
  });
  runButtons.push(button);
  $("#experiment-buttons").append(button);
}

const probe = $("#probe-run");
runButtons.push(probe);
probe.addEventListener("click", () => runInto($("#probe-output"), PROBE_SOURCE));
