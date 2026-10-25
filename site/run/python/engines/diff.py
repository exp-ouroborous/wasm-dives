# The Text Diff tool's Python engine: difflib (Ratcliff/Obershelp matching).
# handle(input JSON) -> output JSON, the contract every language's engine
# follows (tests/engines/diff-cases.json).
import difflib
import json

ENGINE = "Python difflib"


def split_lines(text):
    """CRLF becomes LF, lines split on LF only; a final newline is not a line."""
    lines = text.replace("\r\n", "\n").split("\n")
    if lines[-1] == "":
        lines.pop()
    return lines


def _row(kind, left, right, left_index=None, right_index=None):
    return {
        "kind": kind,
        "left_line": left_index + 1 if left_index is not None else None,
        "left_text": left[left_index] if left_index is not None else "",
        "right_line": right_index + 1 if right_index is not None else None,
        "right_text": right[right_index] if right_index is not None else "",
    }


def _rows(left, right, opcodes):
    rows = []
    for tag, i1, i2, j1, j2 in opcodes:
        if tag == "equal":
            rows.extend(_row("equal", left, right, i, j) for i, j in zip(range(i1, i2), range(j1, j2)))
        elif tag == "delete":
            rows.extend(_row("delete", left, right, left_index=i) for i in range(i1, i2))
        elif tag == "insert":
            rows.extend(_row("insert", left, right, right_index=j) for j in range(j1, j2))
        else:  # replace: pair lines up, extras become deletes or inserts
            paired = min(i2 - i1, j2 - j1)
            rows.extend(_row("replace", left, right, i1 + k, j1 + k) for k in range(paired))
            rows.extend(_row("delete", left, right, left_index=i) for i in range(i1 + paired, i2))
            rows.extend(_row("insert", left, right, right_index=j) for j in range(j1 + paired, j2))
    return rows


def _range(start, stop):
    """difflib's unified range: "3" for one line, "2,0" style for none."""
    length = stop - start
    if length == 1:
        return f"{start + 1}"
    return f"{start},0" if length == 0 else f"{start + 1},{length}"


def _unified(left, right, matcher, from_label, to_label, context=3):
    """difflib.unified_diff's layout, from the given matcher's opcodes."""
    lines = []
    for group in matcher.get_grouped_opcodes(context):
        if not lines:
            lines += [f"--- {from_label}", f"+++ {to_label}"]
        first, last = group[0], group[-1]
        lines.append(f"@@ -{_range(first[1], last[2])} +{_range(first[3], last[4])} @@")
        for tag, i1, i2, j1, j2 in group:
            if tag == "equal":
                lines += [" " + line for line in left[i1:i2]]
                continue
            lines += ["-" + line for line in left[i1:i2]]
            lines += ["+" + line for line in right[j1:j2]]
    return lines


def build_diff(left_text, right_text, from_label="left", to_label="right"):
    left = split_lines(left_text)
    right = split_lines(right_text)
    # One matcher for rows and the unified diff, so both describe the same
    # changes (difflib.unified_diff would build its own with autojunk on).
    matcher = difflib.SequenceMatcher(a=left, b=right, autojunk=False)
    # Copy first: get_grouped_opcodes trims the cached opcode list in place.
    opcodes = list(matcher.get_opcodes())
    diff_lines = _unified(left, right, matcher, from_label or "left", to_label or "right")
    body = diff_lines[2:]
    added = sum(1 for line in body if line.startswith("+"))
    removed = sum(1 for line in body if line.startswith("-"))
    return {
        "ok": True,
        "engine": ENGINE,
        "diff": "\n".join(diff_lines),
        "added": added,
        "removed": removed,
        "changed": min(added, removed),
        "context": sum(1 for line in body if line.startswith(" ")),
        "rows": _rows(left, right, opcodes),
        "error": "",
    }


def handle(input_json):
    data = json.loads(input_json)
    result = build_diff(data.get("left", ""), data.get("right", ""), data.get("from_label", "left"), data.get("to_label", "right"))
    return json.dumps(result, ensure_ascii=False)
