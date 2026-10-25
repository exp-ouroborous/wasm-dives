const UNITS = ["B", "KB", "MB", "GB"];

function unitFor(bytes) {
  let unit = 0;
  while (unit < UNITS.length - 1 && bytes >= 1000 ** (unit + 1)) unit += 1;
  return unit;
}

function scaled(bytes, unit) {
  return unit === 0 ? String(bytes) : (bytes / 1000 ** unit).toFixed(1);
}

export function formatBytes(bytes) {
  const unit = unitFor(bytes);
  return `${scaled(bytes, unit)} ${UNITS[unit]}`;
}

/** "3.2 / 14.6 MB", or just the loaded bytes when the total is unknown. */
export function formatProgress({ loaded, total }) {
  if (total === null || total === undefined) return formatBytes(loaded);
  const unit = unitFor(total);
  return `${scaled(loaded, unit)} / ${scaled(total, unit)} ${UNITS[unit]}`;
}

export function capOutput(text, max = 200_000) {
  return text.length > max ? `${text.slice(0, max)}\n[output truncated]` : text;
}

export function formatDiagnostics(diagnostics) {
  return diagnostics.map((d) => `${d.id} (${d.start}–${d.end}): ${d.message}`).join("\n");
}
