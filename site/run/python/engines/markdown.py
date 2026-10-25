# The Markdown tool's Python engine: Python-Markdown (not CommonMark) with its
# extensions, and bleach for safe mode. handle(input JSON) -> output JSON, the
# contract every language's engine follows (tests/engines/markdown-cases.json).
import json

import markdown

ENGINE = f"Python-Markdown {markdown.__version__}"

# Contract feature -> Python-Markdown extension.
EXTENSIONS = {
    "fenced_code": "fenced_code",
    "tables": "tables",
    "hard_breaks": "nl2br",
    "footnotes": "footnotes",
    "smarty": "smarty",
    "toc": "toc",
    "sane_lists": "sane_lists",
    "extra": "extra",
}

_ALLOWED_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "code", "dd", "del", "div", "dl", "dt", "em",
    "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "span",
    "strong", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
}
_ALLOWED_ATTRIBUTES = {
    "*": ["class", "id", "title"],
    "a": ["href", "title", "rel"],
    "img": ["alt", "src", "title"],
    "td": ["align", "style"],
    "th": ["align", "style"],
}


def _clean(html):
    import bleach

    return bleach.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        protocols=["http", "https", "mailto"],
        strip=True,
    )


def handle(input_json):
    data = json.loads(input_json)
    features = list(data.get("features", []))
    missing = [feature for feature in features if feature not in EXTENSIONS]
    if missing:
        return json.dumps({
            "ok": False,
            "unsupported": True,
            "unsupported_features": missing,
            "engine": ENGINE,
            "html": "",
            "error": f"{', '.join(missing)} is not available in Python",
        })
    try:
        html = markdown.markdown(data.get("source", ""), extensions=[EXTENSIONS[f] for f in features])
        if data.get("safe", False):
            html = _clean(html)
    except Exception as exc:  # an extension can raise on odd input; report it
        return json.dumps({"ok": False, "engine": ENGINE, "html": "", "error": f"{type(exc).__name__}: {exc}"})
    return json.dumps({"ok": True, "engine": ENGINE, "html": html, "error": ""}, ensure_ascii=False)
