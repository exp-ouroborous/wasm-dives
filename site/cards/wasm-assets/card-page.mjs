// Everything a language card page does, shared by every language: theme and
// logo, the sandboxed runner iframe, phase/progress/runtime reporting, the
// scratchpad, experiments and probes, and Stop. A card's own card.mjs only
// supplies its language, wording and programs (and, optionally, run options
// such as a C/C++ dialect).

import { createRunnerClient, runnerOrigin } from "./runner-client.mjs";
import { formatProgress, formatRunResult } from "./format.mjs";
import { languageLogo, languageStyle } from "./languages.mjs";

export function startLanguageCard({ language, runtimeLabel, phaseText, programs, scratchpadOptions, doc = document, loc = location }) {
  const { SCRATCHPAD_DEFAULT, EXPERIMENTS, PROBE_SOURCE, PROBE_OPTIONS } = programs;
  const $ = (selector) => doc.querySelector(selector);
  doc.body.setAttribute("style", languageStyle(language));
  $("#language-logo").append(languageLogo(language, doc));

  const origin = runnerOrigin(loc);
  const iframe = $("#runner");
  iframe.src = `${origin}/run/${language}/`;
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

  async function runInto(output, source, options) {
    setBusy(true);
    output.textContent = "Running…";
    try {
      output.textContent = formatRunResult(await client.run(source, options));
    } catch (error) {
      output.textContent = error.message === "stopped" ? "Stopped." : error.message;
      if (error.message !== "stopped") setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  let started = false;
  client.onPhase((phase) => {
    const text = phase === "idle" && started ? `Stopped — the next Run restarts the ${runtimeLabel} runtime.` : phaseText[phase];
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
  runScratchpad.addEventListener("click", () => runInto($("#scratchpad-output"), input.value, scratchpadOptions?.()));
  stop.addEventListener("click", () => client.stop());

  const experimentOutput = $("#experiment-output");
  for (const experiment of EXPERIMENTS) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = experiment.title;
    button.addEventListener("click", () => {
      $("#experiment-blurb").textContent = experiment.blurb;
      runInto(experimentOutput, experiment.source, experiment.options);
    });
    runButtons.push(button);
    $("#experiment-buttons").append(button);
  }

  const probe = $("#probe-run");
  runButtons.push(probe);
  probe.addEventListener("click", () => runInto($("#probe-output"), PROBE_SOURCE, PROBE_OPTIONS));
}
