# The JSON tool's Python engine: format, minify, validate, analyse and (Python
# only) heal JSON with Python's json module. handle(input_json) -> output_json,
# the contract every language's engine follows (see tests/engines/json-cases.json).

import difflib
import json
import math
import re

ENGINE = "Python json"
_IDENTIFIER_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")


_BARE_KEY_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_-]*")
_BARE_VALUE_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_ .-]*")


def _json_type(value):
    if isinstance(value, dict):
        return "object"
    if isinstance(value, list):
        return "array"
    if isinstance(value, str):
        return "string"
    if isinstance(value, bool):
        return "boolean"
    if value is None:
        return "null"
    return "number"


def _preview(value):
    if isinstance(value, (dict, list)):
        return ""
    return json.dumps(value, ensure_ascii=False)


def _copy_value(value):
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False)


def _path_for_child(parent_path, key):
    if isinstance(key, int):
        return f"{parent_path}[{key}]"
    if _IDENTIFIER_RE.match(key):
        return f"{parent_path}.{key}"
    return f"{parent_path}[{json.dumps(key, ensure_ascii=False)}]"


def _node(value, path="$", key=None, depth=1):
    kind = _json_type(value)
    node = {
        "key": key,
        "path": path,
        "type": kind,
        "preview": _preview(value),
        "copy_value": _copy_value(value),
        "count": 0,
        "children": [],
    }

    if isinstance(value, dict):
        node["count"] = len(value)
        for child_key, child_value in value.items():
            node["children"].append(_node(child_value, _path_for_child(path, child_key), child_key, depth + 1))
    elif isinstance(value, list):
        node["count"] = len(value)
        for index, child_value in enumerate(value):
            node["children"].append(_node(child_value, _path_for_child(path, index), index, depth + 1))

    return node


def _stats(node, depth=1):
    total = 1
    max_depth = depth
    for child in node["children"]:
        child_total, child_depth = _stats(child, depth + 1)
        total += child_total
        max_depth = max(max_depth, child_depth)
    return total, max_depth


def _parse_error(exc):
    return {
        "error": exc.msg,
        "line": exc.lineno,
        "column": exc.colno,
    }


def _json_error_response(exc, **extra):
    response = {
        "ok": False,
        "output": "",
        **_parse_error(exc),
    }
    response.update(extra)
    return response


def _strip_jsonc_comments(source):
    output = []
    i = 0
    in_string = False
    escaped = False

    while i < len(source):
        char = source[i]
        next_char = source[i + 1] if i + 1 < len(source) else ""

        if in_string:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            i += 1
            continue

        if char == '"':
            in_string = True
            output.append(char)
            i += 1
            continue

        if char == "/" and next_char == "/":
            output.extend("  ")
            i += 2
            while i < len(source) and source[i] != "\n":
                output.append(" ")
                i += 1
            continue

        if char == "/" and next_char == "*":
            output.extend("  ")
            i += 2
            while i < len(source):
                if source[i] == "*" and i + 1 < len(source) and source[i + 1] == "/":
                    output.extend("  ")
                    i += 2
                    break
                output.append("\n" if source[i] == "\n" else " ")
                i += 1
            continue

        output.append(char)
        i += 1

    return "".join(output)


def _remove_jsonc_trailing_commas(source):
    chars = list(source)
    i = 0
    in_string = False
    escaped = False

    while i < len(chars):
        char = chars[i]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            i += 1
            continue

        if char == '"':
            in_string = True
        elif char == "," and _next_significant(source, i + 1) in ("}", "]"):
            chars[i] = " "
        i += 1

    return "".join(chars)


def _json_source(source, allow_jsonc=False):
    if not allow_jsonc:
        return source
    return _remove_jsonc_trailing_commas(_strip_jsonc_comments(source))


class _NumberError(ValueError):
    def __init__(self, message, token):
        super().__init__(message)
        self.token = token


def _reject_constant(name):
    raise _NumberError(f"{name} is not valid JSON", name)


def _finite_float(text):
    value = float(text)
    if math.isinf(value):
        raise _NumberError(f"Number {text} is out of range for a Python float", text)
    return value


# Python's json accepts NaN/Infinity and turns 1e400 into inf (which it then
# writes as the invalid token Infinity); reject both, at the token's position.
def _strict_loads(text):
    try:
        return json.loads(text, parse_constant=_reject_constant, parse_float=_finite_float)
    except _NumberError as exc:
        match = re.search(r"(?<![\w.\"])" + re.escape(exc.token) + r"(?![\w.])", text)
        raise json.JSONDecodeError(str(exc), text, match.start() if match else 0) from None


def _loads_json(source, allow_jsonc=False):
    return _strict_loads(_json_source(source, allow_jsonc))


def _diff_segments(before, after):
    segments = []
    matcher = difflib.SequenceMatcher(a=before, b=after, autojunk=False)
    for tag, _before_start, _before_end, after_start, after_end in matcher.get_opcodes():
        if tag == "delete":
            continue
        text = after[after_start:after_end]
        if text:
            segments.append({"text": text, "added": tag in {"insert", "replace"}})
    return segments


def _append_missing_closers(source):
    stack = []
    in_string = False
    escaped = False

    for char in source:
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            stack.append("}")
        elif char == "[":
            stack.append("]")
        elif char in "}]":
            if not stack or char != stack[-1]:
                return source, [], False
            stack.pop()

    if in_string or not stack:
        return source, [], not in_string

    closers = "".join(reversed(stack))
    return source + closers, [f"appended missing closing {closers}"], True


def _previous_significant(source, index):
    index -= 1
    while index >= 0 and source[index].isspace():
        index -= 1
    return source[index] if index >= 0 else ""


def _next_significant(source, index):
    while index < len(source) and source[index].isspace():
        index += 1
    return source[index] if index < len(source) else ""


def _looks_like_quoted_key_start(source, quote_index):
    match = _BARE_KEY_RE.match(source, quote_index + 1)
    if not match:
        return False
    key_end = match.end()
    return key_end < len(source) and source[key_end] == '"' and _next_significant(source, key_end + 1) == ":"


def _insert_before_trailing_space(output, text):
    index = len(output)
    while index > 0 and output[index - 1].isspace():
        index -= 1
    output[index:index] = list(text)


def _repair_missing_string_end_before_key(source):
    output = []
    repairs = []
    i = 0
    in_string = False
    escaped = False

    while i < len(source):
        char = source[i]
        if in_string:
            if not escaped and char == '"' and _looks_like_quoted_key_start(source, i):
                tail = len(output)
                while tail > 0 and output[tail - 1].isspace():
                    tail -= 1
                if tail > 0 and output[tail - 1] == ",":
                    output.insert(tail - 1, '"')
                    repairs.append("closed unterminated string value")
                else:
                    _insert_before_trailing_space(output, '",')
                    repairs.append("closed unterminated string value and inserted missing comma")
                in_string = False
                continue

            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            i += 1
            continue

        output.append(char)
        if char == '"':
            in_string = True
        i += 1

    return "".join(output), repairs


def _insert_missing_commas_before_keys(source):
    output = []
    repairs = []
    i = 0
    in_string = False
    escaped = False

    while i < len(source):
        char = source[i]
        if in_string:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            i += 1
            continue

        if char == '"' and _looks_like_quoted_key_start(source, i):
            previous = _previous_significant("".join(output), len(output))
            if previous and previous not in "{[,":
                _insert_before_trailing_space(output, ",")
                repairs.append("inserted missing comma")

        output.append(char)
        if char == '"':
            in_string = True
        i += 1

    return "".join(output), repairs


def _quote_bare_keys(source):
    output = []
    repairs = []
    i = 0
    in_string = False
    escaped = False

    while i < len(source):
        char = source[i]
        if in_string:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            i += 1
            continue

        if char == '"':
            in_string = True
            output.append(char)
            i += 1
            continue

        match = _BARE_KEY_RE.match(source, i)
        if match:
            token = match.group(0)
            key_context = _previous_significant(source, i) in "{,"
            next_char = _next_significant(source, match.end())
            if key_context and next_char == ":":
                output.append(json.dumps(token))
                repairs.append(f"quoted bare key {token}")
                i = match.end()
                continue

        output.append(char)
        i += 1

    return "".join(output), repairs


def _is_json_number(token):
    try:
        value = _strict_loads(token)
    except json.JSONDecodeError:
        return False
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _quote_bare_values(source):
    output = []
    repairs = []
    i = 0
    in_string = False
    escaped = False

    while i < len(source):
        char = source[i]
        if in_string:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            i += 1
            continue

        if char == '"':
            in_string = True
            output.append(char)
            i += 1
            continue

        if char != ":":
            output.append(char)
            i += 1
            continue

        output.append(char)
        i += 1
        value_start = i
        while i < len(source) and source[i].isspace():
            i += 1
        token_start = i
        while i < len(source) and source[i] not in ",}]":
            i += 1
        token_end = i

        raw_value = source[value_start:token_end]
        token = source[token_start:token_end].strip()
        leading = source[value_start:token_start]
        trailing_count = len(source[token_start:token_end]) - len(source[token_start:token_end].rstrip())
        trailing = source[token_end - trailing_count:token_end] if trailing_count else ""

        if token and _BARE_VALUE_RE.fullmatch(token) and token not in {"true", "false", "null"} and not _is_json_number(token):
            output.append(leading)
            output.append(json.dumps(token))
            output.append(trailing)
            repairs.append(f"quoted bare string value {token}")
        else:
            output.append(raw_value)

    return "".join(output), repairs


def format_json(source, indent=2, sort_keys=False, minify=False, allow_jsonc=False):
    try:
        parsed = _loads_json(source, allow_jsonc)
    except json.JSONDecodeError as exc:
        return _json_error_response(exc)

    if minify:
        output = json.dumps(parsed, sort_keys=sort_keys, separators=(",", ":"), ensure_ascii=False)
    else:
        output = json.dumps(parsed, indent=int(indent), sort_keys=sort_keys, ensure_ascii=False)

    return {
        "ok": True,
        "output": output,
        "error": "",
        "line": None,
        "column": None,
    }


def heal_json(source, indent=2, sort_keys=True, allow_jsonc=False):
    repairs = []
    compare_source = _json_source(source, allow_jsonc)
    try:
        parsed = _loads_json(source, allow_jsonc)
    except json.JSONDecodeError as original_error:
        repaired = compare_source

        repaired, string_repairs = _repair_missing_string_end_before_key(repaired)
        repairs.extend(string_repairs)

        repaired, closer_repairs, balanced = _append_missing_closers(repaired)
        if not balanced:
            return _json_error_response(original_error, repairs=[], repaired=False)
        repairs.extend(closer_repairs)

        repaired, comma_repairs = _insert_missing_commas_before_keys(repaired)
        repairs.extend(comma_repairs)

        repaired, key_repairs = _quote_bare_keys(repaired)
        repairs.extend(key_repairs)

        repaired, value_repairs = _quote_bare_values(repaired)
        repairs.extend(value_repairs)

        try:
            parsed = _strict_loads(repaired)
        except json.JSONDecodeError as repaired_error:
            return _json_error_response(repaired_error, repairs=[], repaired=False)
    else:
        repaired = compare_source

    return {
        "ok": True,
        "output": json.dumps(parsed, indent=int(indent), sort_keys=sort_keys, ensure_ascii=False),
        "repaired_source": repaired,
        "diff_segments": _diff_segments(compare_source, repaired),
        "error": "",
        "line": None,
        "column": None,
        "repairs": repairs,
        "repaired": bool(repairs),
    }


def analyze_json(source, allow_jsonc=False):
    try:
        parsed = _loads_json(source, allow_jsonc)
    except json.JSONDecodeError as exc:
        return {
            "ok": False,
            "tree": None,
            "summary": {},
            "error": exc.msg,
            "line": exc.lineno,
            "column": exc.colno,
        }

    tree = _node(parsed)
    total_nodes, max_depth = _stats(tree)
    return {
        "ok": True,
        "tree": tree,
        "summary": {
            "root_type": tree["type"],
            "total_nodes": total_nodes,
            "max_depth": max_depth,
            "root_count": tree["count"],
        },
        "error": "",
        "line": None,
        "column": None,
    }


def handle(input_json):
    data = json.loads(input_json)
    action = data.get("action", "format")
    source = data.get("source", "")
    jsonc = bool(data.get("allow_jsonc", False))
    if action == "analyze":
        result = analyze_json(source, allow_jsonc=jsonc)
    elif action == "heal":
        result = heal_json(source, indent=int(data.get("indent", 2)), sort_keys=bool(data.get("sort_keys", True)), allow_jsonc=jsonc)
    else:
        result = format_json(
            source,
            indent=int(data.get("indent", 2)),
            sort_keys=bool(data.get("sort_keys", False)),
            minify=bool(data.get("minify", False)),
            allow_jsonc=jsonc,
        )
    result["engine"] = ENGINE
    return json.dumps(result, ensure_ascii=False)
