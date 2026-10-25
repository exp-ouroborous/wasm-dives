// A branded language dropdown for tool pages: each option shows its language's
// logo in that language's colour (from languages.mjs). An accessible listbox:
// the button opens it; arrows move, Enter selects, Escape closes.

import { LANGUAGES, languageLogo } from "./languages.mjs";

/** Pure keyboard handling: { open, active, selected } after a key. */
export function pickerKeyReducer(state, key, count) {
  switch (key) {
    case "ArrowDown":
      return state.open ? { ...state, active: Math.min(state.active + 1, count - 1) } : { ...state, open: true, active: state.selected };
    case "ArrowUp":
      return state.open ? { ...state, active: Math.max(state.active - 1, 0) } : { ...state, open: true, active: state.selected };
    case "Enter":
    case " ":
      return state.open ? { open: false, active: state.active, selected: state.active } : { ...state, open: true, active: state.selected };
    case "Escape":
      return { open: false, active: state.selected, selected: state.selected };
    default:
      return state;
  }
}

function chip(language, doc) {
  const span = doc.createElement("span");
  span.className = "lang-chip";
  span.style.setProperty("--lang", LANGUAGES[language].color);
  span.append(languageLogo(language, doc));
  return span;
}

export function createLanguagePicker({ root, languages, value, onChange, doc = document }) {
  let state = { open: false, active: languages.indexOf(value), selected: languages.indexOf(value) };
  const id = `lang-list-${Math.random().toString(36).slice(2)}`;

  const button = doc.createElement("button");
  button.type = "button";
  button.className = "lang-button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-controls", id);

  const list = doc.createElement("ul");
  list.id = id;
  list.className = "lang-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;

  const options = languages.map((language, index) => {
    const option = doc.createElement("li");
    option.setAttribute("role", "option");
    option.id = `${id}-${language}`;
    option.className = "lang-option";
    option.style.setProperty("--lang", LANGUAGES[language].color);
    const label = doc.createElement("span");
    label.textContent = LANGUAGES[language].label;
    option.append(chip(language, doc), label);
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => apply({ open: false, active: index, selected: index }));
    list.append(option);
    return option;
  });

  function render() {
    const language = languages[state.selected];
    const label = doc.createElement("span");
    label.textContent = LANGUAGES[language].label;
    const caret = doc.createElement("span");
    caret.className = "lang-caret";
    caret.textContent = "▾";
    button.replaceChildren(chip(language, doc), label, caret);
    button.style.setProperty("--lang", LANGUAGES[language].color);
    button.setAttribute("aria-expanded", String(state.open));
    list.hidden = !state.open;
    options.forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === state.selected));
      option.classList.toggle("active", index === state.active);
    });
    if (state.open) button.setAttribute("aria-activedescendant", options[state.active].id);
    else button.removeAttribute("aria-activedescendant");
  }

  function apply(next) {
    const changed = next.selected !== state.selected;
    state = next;
    render();
    if (changed) onChange(languages[state.selected]);
  }

  button.addEventListener("click", () => apply(pickerKeyReducer(state, "Enter", languages.length)));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " ", "Escape"].includes(event.key)) return;
    event.preventDefault();
    apply(pickerKeyReducer(state, event.key, languages.length));
  });
  button.addEventListener("blur", () => state.open && apply({ ...state, open: false, active: state.selected }));

  root.replaceChildren(button, list);
  render();
  return {
    get value() {
      return languages[state.selected];
    },
  };
}
