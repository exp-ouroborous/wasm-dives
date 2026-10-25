// Runs inside the sandbox iframe. Bridges the card page (parent) to a
// dedicated worker that hosts the language runtime, and turns service-worker
// byte counts into progress. Stop terminates the worker outright.

import { ProgressTracker } from "../sw-core.mjs";
import { PROTOCOL, isAllowedOrigin, parseMessage } from "./protocol.mjs";
import { DOWNLOAD_FAILED, chooseLoadStrategy, initialState, runnerReducer } from "./runner-state.mjs";

const NO_PROGRESS_NOTICE = "Progress and caching unavailable in this browser mode";

async function controlledByServiceWorker() {
  try {
    await navigator.serviceWorker.register("/run/sw.js", { scope: "/run/" });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
    return true;
  } catch {
    // e.g. private browsing modes that disable service workers.
    return false;
  }
}

async function groupTotal(language) {
  const response = await fetch("/run/manifest.json", { cache: "no-cache" });
  const manifest = await response.json();
  return manifest.groups[language]?.totalBytes ?? null;
}

export function startRunnerHost({ language, workerUrl, win = window }) {
  let state = initialState;
  let worker = null;
  let tracker = null;
  let parentOrigin = null;
  const controlled =
    chooseLoadStrategy({ hasServiceWorker: "serviceWorker" in navigator }) === "service-worker"
      ? controlledByServiceWorker()
      : Promise.resolve(false);
  const total = groupTotal(language).catch(() => null);

  function post(message) {
    if (parentOrigin) win.parent.postMessage({ protocol: PROTOCOL, ...message }, parentOrigin);
  }

  function dispatch(event) {
    const before = state.phase;
    state = runnerReducer(state, event);
    if (state.phase !== before) post({ type: "phase", phase: state.phase });
  }

  function discardWorker() {
    worker?.terminate();
    worker = null;
    tracker = null;
  }

  async function ensureWorker() {
    if (worker) return worker;
    const usingServiceWorker = await controlled;
    const totalBytes = usingServiceWorker ? await total : null;
    tracker = totalBytes ? new ProgressTracker(totalBytes) : null;
    if (!tracker) {
      post({ type: "progress", loaded: 0, total: null });
      if (!usingServiceWorker) post({ type: "notice", message: NO_PROGRESS_NOTICE });
    }
    worker = new Worker(workerUrl, { type: "module" });
    worker.addEventListener("message", ({ data }) => {
      if (data?.type === "booted") {
        dispatch({ type: "booted" });
        post({ type: "runtime", language, version: data.version });
      } else if (data?.type === "result") {
        dispatch({ type: "result", id: data.id });
        post(data);
      }
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      const pending = state.pendingRunId;
      discardWorker();
      dispatch({ type: "stop-requested" });
      post({ type: "error", id: pending ?? undefined, message: `The ${language} runtime crashed: ${event.message || "unknown error"}` });
    });
    return worker;
  }

  const progress = new BroadcastChannel("wasm-dives-progress");
  progress.addEventListener("message", ({ data }) => {
    if (data?.group !== language || !worker) return;
    if (data.type === "progress" && tracker && state.phase === "downloading") {
      const update = tracker.add(data.bytes);
      post({ type: "progress", ...update });
      dispatch({ type: "download-progress", ...update });
    } else if (data.type === "download-failed" && (state.phase === "downloading" || state.phase === "starting")) {
      const pending = state.pendingRunId;
      discardWorker();
      dispatch({ type: "download-failed" });
      post({ type: "error", id: pending ?? undefined, message: DOWNLOAD_FAILED });
    }
  });

  win.addEventListener("message", async (event) => {
    if (event.source !== win.parent || !isAllowedOrigin(event.origin)) return;
    const message = parseMessage(event.data);
    if (!message) return;
    parentOrigin = event.origin;
    if (message.type === "stop") {
      discardWorker();
      dispatch({ type: "stop-requested" });
      return;
    }
    if (state.pendingRunId) return; // one run at a time; the card disables Run meanwhile
    dispatch({ type: "run-requested", id: message.id });
    const target = await ensureWorker();
    if (worker === target) target.postMessage({ type: "run", id: message.id, source: message.source });
  });
}
