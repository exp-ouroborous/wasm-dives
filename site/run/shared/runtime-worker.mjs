// The worker half of a language runtime: boot once, answer runs. A failed boot
// is reported (not left as an unhandled rejection, which the runner page
// would never hear about) so the card can offer a retry.

const message = (error) => String(error?.message ?? error);

export function serveRuntime({ boot, run, call, post = (m) => self.postMessage(m), target = self }) {
  const booting = boot().then(({ runtime, version }) => {
    post({ type: "booted", version });
    return runtime;
  });
  booting.catch((error) => post({ type: "boot-failed", message: message(error) }));

  // Registered before the runtime finishes booting so an early Run is not lost.
  target.addEventListener("message", async ({ data }) => {
    if (data?.type === "call") {
      let runtime;
      try {
        runtime = await booting;
      } catch {
        return; // already reported as boot-failed
      }
      const started = performance.now();
      let reply;
      try {
        if (!call) throw new Error("this runtime does not host tool engines");
        reply = { ok: true, output: await call(runtime, data.engine, data.input), error: "" };
      } catch (error) {
        reply = { ok: false, output: null, error: message(error) };
      }
      post({ type: "called", id: data.id, ...reply, ms: Math.round(performance.now() - started) });
      return;
    }
    if (data?.type !== "run") return;
    let runtime;
    try {
      runtime = await booting;
    } catch {
      return; // already reported as boot-failed
    }
    const started = performance.now();
    let result;
    try {
      result = await run(runtime, data.source, data.options ?? {});
    } catch (error) {
      result = { ok: false, stdout: "", stderr: message(error), diagnostics: [] };
    }
    post({ type: "result", id: data.id, ms: Math.round(performance.now() - started), ...result });
  });
}
