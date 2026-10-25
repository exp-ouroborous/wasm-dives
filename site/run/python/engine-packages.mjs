// Packages a Python tool engine imports, loaded before its first call: wheels
// the build vendors (pinned by hash in runtimes.json, served from our origin)
// and names from Pyodide's lock file (checked against its SHA-256).
export const ENGINE_PACKAGES = {
  markdown: { wheels: ["markdown-3.11-py3-none-any.whl"], lock: ["bleach"] },
};

export function enginePackages(name, wheelBase) {
  const packages = ENGINE_PACKAGES[name];
  if (!packages) return [];
  return [...packages.wheels.map((file) => new URL(file, wheelBase).href), ...packages.lock];
}
