// Which Markdown features each language's engine supports. The page disables
// what a language lacks, and the engines refuse it (tests/engines check both
// against this table), so nothing is ever silently ignored.

export const FEATURES = {
  fenced_code: "Fenced code",
  tables: "Tables",
  hard_breaks: "Line breaks",
  footnotes: "Footnotes",
  smarty: "Smart quotes",
  toc: "Table of contents",
  sane_lists: "Sane lists",
  extra: "Extra",
};

// "yes": a toggle; "always": built into the language's Markdown (CommonMark
// fenced code), so it cannot be turned off; absent: not available.
export const SUPPORT = {
  python: { fenced_code: "yes", tables: "yes", hard_breaks: "yes", footnotes: "yes", smarty: "yes", toc: "yes", sane_lists: "yes", extra: "yes" },
  csharp: { fenced_code: "always", tables: "yes", hard_breaks: "yes", footnotes: "yes", smarty: "yes" },
  go: { fenced_code: "always", tables: "yes", hard_breaks: "yes", footnotes: "yes", smarty: "yes" },
  cpp: { fenced_code: "always", tables: "yes", hard_breaks: "yes" },
};

export function unsupportedFeatures(language, features) {
  return features.filter((feature) => !SUPPORT[language]?.[feature]);
}
