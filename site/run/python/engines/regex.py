# The regex tool's Python engine: analyse a pattern with Python's `re`.
# handle(input_json) -> output_json, the contract every language's engine
# follows (offsets in Unicode code points; replacements written $1 / $name).

import json
import re

ENGINE = "Python re"

FLAGS = {
    "ignorecase": re.IGNORECASE,
    "multiline": re.MULTILINE,
    "dotall": re.DOTALL,
}


def _replacement(text):
    # $1 / $name -> Python's \1 / \g<name>
    def token(match):
        name = match.group(1)
        return "\\" + name if name.isdigit() else "\\g<" + name + ">"

    return re.sub(r"\$([A-Za-z_][A-Za-z0-9_]*|\d+)", token, text)


def _failure(message, **extra):
    return {"ok": False, "error": message, "engine": ENGINE, "match_count": 0, "matches": [], "substitution": "", "full_match": False, **extra}


def analyze(pattern, text, flags=(), replacement=""):
    combined = 0
    for name in flags:
        combined |= FLAGS.get(name, 0)
    try:
        compiled = re.compile(pattern, combined)
    except re.error as exc:
        return _failure(str(exc))

    matches = [
        {
            "index": index,
            "match": match.group(0),
            "start": match.start(),
            "end": match.end(),
            "groups": match.groupdict(),
            "numbered_groups": list(match.groups()),
        }
        for index, match in enumerate(compiled.finditer(text), start=1)
    ]

    substitution = ""
    if replacement:
        try:
            substitution = compiled.sub(_replacement(replacement), text)
        except (re.error, IndexError) as exc:
            return _failure("Replacement error: " + str(exc), match_count=len(matches), matches=matches)

    return {
        "ok": True,
        "error": "",
        "engine": ENGINE,
        "match_count": len(matches),
        "matches": matches,
        "substitution": substitution,
        "full_match": compiled.fullmatch(text) is not None,
    }


def handle(input_json):
    data = json.loads(input_json)
    return json.dumps(analyze(data["pattern"], data["text"], data.get("flags", []), data.get("replacement", "")))
