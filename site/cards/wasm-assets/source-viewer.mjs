// "View source": a modal <dialog> showing the engine source a tool is running
// in the chosen language — the same file the sandbox compiles or loads.

import { LANGUAGES } from "./languages.mjs";

/** [paddedNumber, line] pairs, numbers right-aligned to the widest. */
export function numberLines(text) {
  const lines = text.replace(/\n$/, "").split("\n");
  const width = String(lines.length).length;
  return lines.map((line, index) => [String(index + 1).padStart(width, " "), line]);
}

export async function openSourceViewer({ language, title, url, doc = document, fetcher = fetch }) {
  const dialog = doc.createElement("dialog");
  dialog.className = "source-dialog";
  dialog.style.setProperty("--lang", LANGUAGES[language].color);

  const header = doc.createElement("header");
  const heading = doc.createElement("h2");
  heading.textContent = `${title} — ${LANGUAGES[language].label}`;
  const actions = doc.createElement("div");
  const copy = doc.createElement("button");
  copy.type = "button";
  copy.className = "button secondary";
  copy.textContent = "Copy";
  const close = doc.createElement("button");
  close.type = "button";
  close.className = "button";
  close.textContent = "Close";
  actions.append(copy, close);
  header.append(heading, actions);

  const code = doc.createElement("pre");
  code.className = "source-code";
  code.textContent = "Loading…";
  dialog.append(header, code);
  doc.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => event.target === dialog && dialog.close());
  dialog.showModal();

  let source = "";
  try {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    source = await response.text();
    code.replaceChildren(
      ...numberLines(source).map(([number, line]) => {
        const row = doc.createElement("span");
        row.className = "source-line";
        const gutter = doc.createElement("span");
        gutter.className = "source-gutter";
        gutter.textContent = number;
        row.append(gutter, doc.createTextNode(`${line}\n`));
        return row;
      }),
    );
  } catch (error) {
    code.textContent = `Could not load the source: ${error.message}`;
  }
  copy.addEventListener("click", () => navigator.clipboard?.writeText(source));
  return dialog;
}
