// Runs inside the sandbox iframe. Bridges the card page (parent) to a
// dedicated worker that hosts the language runtime, and turns service-worker
// byte counts into progress. Stop terminates the worker outright, and also
// cancels a worker that is still being prepared.

import { ProgressTracker } from "../sw-core.mjs";
import { PROTOCOL, isAllowedOrigin, parseMessage } from "./protocol.mjs";
import { BOOT_FAILED, DOWNLOAD_FAILED, chooseLoadStrategy, initialState, runnerReducer } from "./runner-state.mjs";

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
    // e.g. private browsing modes and embedded browsers that disable service workers.
    return false;
  }
}

async function groupTotal(language) {
  const response = await fetch("/run/manifest.json", { cache: "no-cache" });
  const manifest = await response.json();
  return manifest.groups[language]?.totalBytes ?? null;
}

function browserDeps(language, workerUrl) {
  const hasServiceWorker = "serviceWorker" in navigator;
  return {
    controlled: chooseLoadStrategy({ hasServiceWorker }) === "service-worker" ? controlledByServiceWorker() : Promise.resolve(false),
    total: groupTotal(language).catch(() => null),
    createWorker: () => new Worker(workerUrl, { type: "module" }),
    progressChannel: new BroadcastChannel("wasm-dives-progress"),
  };
}

export function startRunnerHost({ language, workerUrl, win = window, deps = browserDeps(language, workerUrl) }) {
  let state = initialState;
  let worker = null;
  let tracker = null;
  let parentOrigin = null;
  // Bumped by Stop and by failures, so a worker still being prepared for an
  // abandoned run is never created.
  let generation = 0;

  function post(message) {
    if (parentOrigin) win.parent.postMessage({ protocol: PROTOCOL, ...message }, parentOrigin);
  }

  function dispatch(event) {
    const before = state.phase;
    state = runnerReducer(state, event);
    if (state.phase !== before) post({ type: "phase", phase: state.phase });
  }

  function discardWorker() {
    generation += 1;
    worker?.terminate();
    worker = null;
    tracker = null;
  }

  function fail(event, text) {
    const pending = state.pendingRunId;
    discardWorker();
    dispatch(event);
    post({ type: "error", id: pending ?? undefined, message: text });
  }

  async function ensureWorker() {
    if (worker) return worker;
    const mine = generation;
    const usingServiceWorker = await deps.controlled;
    const totalBytes = usingServiceWorker ? await deps.total : null;
    if (mine !== generation || worker) return worker; // stopped meanwhile
    tracker = totalBytes ? new ProgressTracker(totalBytes) : null;
    if (!tracker) {
      post({ type: "progress", loaded: 0, total: null });
      if (!usingServiceWorker) post({ type: "notice", message: NO_PROGRESS_NOTICE });
    }
    const created = deps.createWorker();
    worker = created;
    created.addEventListener("message", ({ data }) => {
      if (created !== worker) return;
      if (data?.type === "booted") {
        if (tracker) post({ type: "progress", ...tracker.complete() });
        dispatch({ type: "booted" });
        post({ type: "runtime", language, version: data.version });
      } else if (data?.type === "boot-failed") {
        fail({ type: "boot-failed" }, BOOT_FAILED);
      } else if (data?.type === "result") {
        dispatch({ type: "result", id: data.id });
        post(data);
      }
    });
    created.addEventListener("error", (event) => {
      if (created !== worker) return;
      event.preventDefault?.();
      fail({ type: "stop-requested" }, `The ${language} runtime crashed: ${event.message || "unknown error"}`);
    });
    return created;
  }

  deps.progressChannel.addEventListener("message", ({ data }) => {
    if (data?.group !== language || !worker) return;
    if (data.type === "progress" && tracker && state.phase === "downloading") {
      const update = tracker.add(data.path, data.bytes, data.size);
      post({ type: "progress", ...update });
      dispatch({ type: "download-progress", ...update });
    } else if (data.type === "download-failed" && (state.phase === "downloading" || state.phase === "starting")) {
      fail({ type: "download-failed" }, DOWNLOAD_FAILED);
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
    if (target && target === worker && state.pendingRunId === message.id) {
      const { id, source, options } = message;
      target.postMessage(options === undefined ? { type: "run", id, source } : { type: "run", id, source, options });
    }
  });
}
