// Card-side client for a sandbox runner iframe. Cards and runners live on
// different origins, so this keeps its own copy of the protocol tag instead
// of importing it from the runner.

const PROTOCOL = "wasm-dives/1";
const SANDBOX_ORIGIN = "https://wasm-dives.pages.dev";

/** Local dev serves cards on localhost and runners on 127.0.0.1: two origins, one server. */
export function runnerOrigin({ hostname, port }) {
  return hostname === "localhost" ? `http://127.0.0.1:${port}` : SANDBOX_ORIGIN;
}

function iframeLoaded(iframe) {
  return new Promise((resolve) => iframe.addEventListener("load", () => resolve(), { once: true }));
}

export function createRunnerClient({ iframe, origin, win = window, loaded = iframeLoaded(iframe) }) {
  const listeners = { phase: [], progress: [], runtime: [], notice: [] };
  let pending = null;

  const send = async (message) => {
    await loaded;
    iframe.contentWindow.postMessage({ protocol: PROTOCOL, ...message }, origin);
  };

  const settle = (outcome, value) => {
    const current = pending;
    pending = null;
    current?.[outcome](value);
  };

  win.addEventListener("message", (event) => {
    if (event.origin !== origin || event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (data === null || typeof data !== "object" || data.protocol !== PROTOCOL) return;
    switch (data.type) {
      case "result":
        if (pending && data.id === pending.id) settle("resolve", data);
        break;
      case "error":
        if (pending && (data.id === undefined || data.id === pending.id)) settle("reject", new Error(data.message));
        break;
      case "phase":
        listeners.phase.forEach((cb) => cb(data.phase));
        break;
      case "progress":
        listeners.progress.forEach((cb) => cb({ loaded: data.loaded, total: data.total }));
        break;
      case "runtime":
        listeners.runtime.forEach((cb) => cb({ language: data.language, version: data.version }));
        break;
      case "notice":
        listeners.notice.forEach((cb) => cb(data.message));
        break;
    }
  });

  return {
    run(source) {
      if (pending) settle("reject", new Error("superseded"));
      const id = crypto.randomUUID();
      const promise = new Promise((resolve, reject) => {
        pending = { id, resolve, reject };
      });
      send({ type: "run", id, source });
      return promise;
    },
    stop() {
      settle("reject", new Error("stopped"));
      send({ type: "stop" });
    },
    onPhase: (cb) => listeners.phase.push(cb),
    onProgress: (cb) => listeners.progress.push(cb),
    onRuntime: (cb) => listeners.runtime.push(cb),
    onNotice: (cb) => listeners.notice.push(cb),
  };
}
