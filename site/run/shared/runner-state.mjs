// The runner's lifecycle as a pure reducer, so Stop and download failures are
// testable without a browser.

export const DOWNLOAD_FAILED = "Download failed — press Run to retry";

export const initialState = Object.freeze({ phase: "idle", pendingRunId: null, error: null });

export function runnerReducer(state, event) {
  switch (event.type) {
    case "run-requested":
      return { phase: state.phase === "ready" ? "running" : "downloading", pendingRunId: event.id, error: null };
    case "download-progress":
      return state.phase === "downloading" && event.total !== null && event.loaded >= event.total
        ? { ...state, phase: "starting" }
        : state;
    case "booted":
      return { ...state, phase: state.pendingRunId ? "running" : "ready" };
    case "result":
      return { phase: "ready", pendingRunId: null, error: null };
    case "stop-requested":
      return initialState;
    case "download-failed":
      return { phase: "idle", pendingRunId: null, error: DOWNLOAD_FAILED };
    default:
      return state;
  }
}

export function chooseLoadStrategy({ hasServiceWorker }) {
  return hasServiceWorker ? "service-worker" : "direct";
}
