// The JSON tool's C++ engine: format, minify, validate and analyse JSON with a
// hand-written recursive-descent parser (the standard library has no JSON).
// argv: action, source, indent, sort_keys, minify, allow_jsonc (flags 1/0).
// Prints the contract's JSON (see tests/engines/json-cases.json). Healing is
// Python-only.
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <string>
#include <utility>
#include <vector>

static const char* ENGINE = "C++ (hand-written parser)";

// Deep nesting would overflow the wasm stack; refuse it with an error instead.
static const int MAX_DEPTH = 512;

struct Value {
    enum Kind { Object, Array, String, Number, Boolean, Null } kind = Null;
    std::vector<std::string> keys;
    std::vector<std::unique_ptr<Value>> items;
    std::string text;  // decoded string, or number text
    bool truth = false;
};

struct Parser {
    const std::string& s;
    size_t pos = 0;
    std::string error;
    size_t error_pos = 0;

    bool fail(const std::string& message, size_t at) {
        if (error.empty()) {
            error = message;
            error_pos = at;
        }
        return false;
    }

    void skip_space() {
        while (pos < s.size() && (s[pos] == ' ' || s[pos] == '\t' || s[pos] == '\n' || s[pos] == '\r')) pos++;
    }

    static void append_utf8(std::string& out, unsigned long cp) {
        if (cp < 0x80) {
            out += static_cast<char>(cp);
        } else if (cp < 0x800) {
            out += static_cast<char>(0xC0 | (cp >> 6));
            out += static_cast<char>(0x80 | (cp & 0x3F));
        } else if (cp < 0x10000) {
            out += static_cast<char>(0xE0 | (cp >> 12));
            out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
            out += static_cast<char>(0x80 | (cp & 0x3F));
        } else {
            out += static_cast<char>(0xF0 | (cp >> 18));
            out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
            out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
            out += static_cast<char>(0x80 | (cp & 0x3F));
        }
    }

    bool hex4(unsigned long& out) {
        if (pos + 4 > s.size()) return fail("Invalid \\u escape", pos);
        out = 0;
        for (int i = 0; i < 4; i++) {
            char c = s[pos + i];
            out <<= 4;
            if (c >= '0' && c <= '9') out |= c - '0';
            else if (c >= 'a' && c <= 'f') out |= c - 'a' + 10;
            else if (c >= 'A' && c <= 'F') out |= c - 'A' + 10;
            else return fail("Invalid \\u escape", pos + i);
        }
        pos += 4;
        return true;
    }

    bool string(std::string& out) {
        size_t start = pos++;  // the opening quote
        while (true) {
            if (pos >= s.size()) return fail("Unterminated string", start);
            unsigned char c = s[pos];
            if (c == '"') {
                pos++;
                return true;
            }
            if (c < 0x20) return fail("Invalid control character in string", pos);
            if (c != '\\') {
                out += static_cast<char>(c);
                pos++;
                continue;
            }
            if (++pos >= s.size()) return fail("Unterminated string", start);
            char e = s[pos++];
            switch (e) {
                case '"': out += '"'; break;
                case '\\': out += '\\'; break;
                case '/': out += '/'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                case 'n': out += '\n'; break;
                case 'r': out += '\r'; break;
                case 't': out += '\t'; break;
                case 'u': {
                    unsigned long cp;
                    if (!hex4(cp)) return false;
                    if (cp >= 0xD800 && cp <= 0xDBFF && pos + 1 < s.size() && s[pos] == '\\' && s[pos + 1] == 'u') {
                        size_t mark = pos;
                        pos += 2;
                        unsigned long low;
                        if (!hex4(low)) return false;
                        if (low >= 0xDC00 && low <= 0xDFFF) cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
                        else pos = mark;  // not a pair: reread the next escape on its own
                    }
                    // A lone surrogate is not valid Unicode; write U+FFFD like Go and .NET.
                    if (cp >= 0xD800 && cp <= 0xDFFF) cp = 0xFFFD;
                    append_utf8(out, cp);
                    break;
                }
                default: return fail("Invalid escape in string", pos - 1);
            }
        }
    }

    static bool digit(char c) { return c >= '0' && c <= '9'; }

    bool number(std::string& out) {
        size_t start = pos;
        if (s[pos] == '-') pos++;
        if (pos < s.size() && s[pos] == '0') {
            pos++;
        } else if (pos < s.size() && digit(s[pos])) {
            while (pos < s.size() && digit(s[pos])) pos++;
        } else {
            return fail("Invalid number", start);
        }
        if (pos < s.size() && s[pos] == '.') {
            pos++;
            if (pos >= s.size() || !digit(s[pos])) return fail("Invalid number", pos);
            while (pos < s.size() && digit(s[pos])) pos++;
        }
        if (pos < s.size() && (s[pos] == 'e' || s[pos] == 'E')) {
            pos++;
            if (pos < s.size() && (s[pos] == '+' || s[pos] == '-')) pos++;
            if (pos >= s.size() || !digit(s[pos])) return fail("Invalid number", pos);
            while (pos < s.size() && digit(s[pos])) pos++;
        }
        out = s.substr(start, pos - start);
        return true;
    }

    bool literal(const char* word) {
        size_t n = std::char_traits<char>::length(word);
        if (s.compare(pos, n, word) != 0) return fail("Expecting value", pos);
        pos += n;
        return true;
    }

    bool value(Value& v, int depth) {
        if (depth > MAX_DEPTH) return fail("Nesting is too deep", pos);
        skip_space();
        if (pos >= s.size()) return fail("Expecting value", pos);
        char c = s[pos];
        if (c == '{') {
            v.kind = Value::Object;
            pos++;
            skip_space();
            if (pos < s.size() && s[pos] == '}') {
                pos++;
                return true;
            }
            while (true) {
                skip_space();
                if (pos >= s.size() || s[pos] != '"') return fail("Expecting property name enclosed in double quotes", pos);
                std::string key;
                if (!string(key)) return false;
                skip_space();
                if (pos >= s.size() || s[pos] != ':') return fail("Expecting ':' delimiter", pos);
                pos++;
                auto child = std::make_unique<Value>();
                if (!value(*child, depth + 1)) return false;
                v.keys.push_back(std::move(key));
                v.items.push_back(std::move(child));
                skip_space();
                if (pos < s.size() && s[pos] == ',') {
                    pos++;
                    continue;
                }
                if (pos < s.size() && s[pos] == '}') {
                    pos++;
                    return true;
                }
                return fail("Expecting ',' delimiter", pos);
            }
        }
        if (c == '[') {
            v.kind = Value::Array;
            pos++;
            skip_space();
            if (pos < s.size() && s[pos] == ']') {
                pos++;
                return true;
            }
            while (true) {
                auto child = std::make_unique<Value>();
                if (!value(*child, depth + 1)) return false;
                v.items.push_back(std::move(child));
                skip_space();
                if (pos < s.size() && s[pos] == ',') {
                    pos++;
                    continue;
                }
                if (pos < s.size() && s[pos] == ']') {
                    pos++;
                    return true;
                }
                return fail("Expecting ',' delimiter", pos);
            }
        }
        if (c == '"') {
            v.kind = Value::String;
            return string(v.text);
        }
        if (c == '-' || digit(c)) {
            v.kind = Value::Number;
            return number(v.text);
        }
        if (c == 't') {
            v.kind = Value::Boolean;
            v.truth = true;
            return literal("true");
        }
        if (c == 'f') {
            v.kind = Value::Boolean;
            return literal("false");
        }
        if (c == 'n') return literal("null");
        return fail("Expecting value", pos);
    }

    bool document(Value& v) {
        if (!value(v, 1)) return false;
        skip_space();
        if (pos < s.size()) return fail("Extra data after the top-level value", pos);
        return true;
    }
};

// 1-based line and column (in code points) of a byte offset.
static std::pair<long, long> position(const std::string& s, size_t offset) {
    long line = 1;
    long column = 1;
    for (size_t i = 0; i < offset && i < s.size(); i++) {
        if (s[i] == '\n') {
            line++;
            column = 1;
        } else if ((static_cast<unsigned char>(s[i]) & 0xC0) != 0x80) {
            column++;
        }
    }
    return {line, column};
}

static void quote(std::string& out, const std::string& s) {
    out += '"';
    for (unsigned char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            default:
                if (c < 0x20) {
                    char buffer[8];
                    std::snprintf(buffer, sizeof buffer, "\\u%04x", c);
                    out += buffer;
                } else {
                    out += static_cast<char>(c);
                }
        }
    }
    out += '"';
}

static void encode(std::string& out, const Value& v, int indent, int level, bool sort_keys, bool minify) {
    switch (v.kind) {
        case Value::String: quote(out, v.text); return;
        case Value::Number: out += v.text; return;
        case Value::Boolean: out += v.truth ? "true" : "false"; return;
        case Value::Null: out += "null"; return;
        default: break;
    }
    bool object = v.kind == Value::Object;
    out += object ? '{' : '[';
    if (v.items.empty()) {
        out += object ? '}' : ']';
        return;
    }
    std::vector<size_t> order(v.items.size());
    for (size_t i = 0; i < order.size(); i++) order[i] = i;
    // UTF-8 byte order is code-point order, the same as Python's sort_keys.
    if (object && sort_keys) std::stable_sort(order.begin(), order.end(), [&](size_t a, size_t b) { return v.keys[a] < v.keys[b]; });
    auto pad = [&](int depth) {
        if (!minify) {
            out += '\n';
            out.append(static_cast<size_t>(indent * depth), ' ');
        }
    };
    for (size_t n = 0; n < order.size(); n++) {
        if (n > 0) out += ',';
        pad(level + 1);
        if (object) {
            quote(out, v.keys[order[n]]);
            out += minify ? ":" : ": ";
        }
        encode(out, *v.items[order[n]], indent, level + 1, sort_keys, minify);
    }
    pad(level);
    out += object ? '}' : ']';
}

static std::string render(const Value& v, int indent, bool sort_keys, bool minify) {
    std::string out;
    encode(out, v, indent, 0, sort_keys, minify);
    return out;
}

static const char* kind_name(const Value& v) {
    switch (v.kind) {
        case Value::Object: return "object";
        case Value::Array: return "array";
        case Value::String: return "string";
        case Value::Number: return "number";
        case Value::Boolean: return "boolean";
        default: return "null";
    }
}

static bool identifier(const std::string& key) {
    if (key.empty()) return false;
    for (size_t i = 0; i < key.size(); i++) {
        char c = key[i];
        bool letter = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_';
        if (!letter && !(i > 0 && c >= '0' && c <= '9')) return false;
    }
    return true;
}

static void tree(std::string& out, const Value& v, const std::string& path, const std::string& key_json, int depth, long& total, long& max_depth) {
    total++;
    if (depth > max_depth) max_depth = depth;
    bool container = v.kind == Value::Object || v.kind == Value::Array;
    out += "{\"key\":" + key_json + ",\"path\":";
    quote(out, path);
    out += ",\"type\":\"";
    out += kind_name(v);
    out += "\",\"preview\":";
    quote(out, container ? "" : render(v, 0, false, true));
    out += ",\"copy_value\":";
    quote(out, render(v, 2, true, false));
    out += ",\"count\":" + std::to_string(v.items.size()) + ",\"children\":[";
    for (size_t i = 0; i < v.items.size(); i++) {
        if (i > 0) out += ',';
        if (v.kind == Value::Object) {
            const std::string& key = v.keys[i];
            std::string child_key;
            quote(child_key, key);
            tree(out, *v.items[i], identifier(key) ? path + "." + key : path + "[" + child_key + "]", child_key, depth + 1, total, max_depth);
        } else {
            tree(out, *v.items[i], path + "[" + std::to_string(i) + "]", std::to_string(i), depth + 1, total, max_depth);
        }
    }
    out += "]}";
}

// JSONC: blank out // and /* */ comments (keeping newlines, so error
// positions stay true), then trailing commas before } or ].
static std::string strip_jsonc(std::string s) {
    bool in_string = false, escaped = false;
    for (size_t i = 0; i < s.size(); i++) {
        char c = s[i];
        if (in_string) {
            if (escaped) escaped = false;
            else if (c == '\\') escaped = true;
            else if (c == '"') in_string = false;
            continue;
        }
        if (c == '"') {
            in_string = true;
        } else if (c == '/' && i + 1 < s.size() && s[i + 1] == '/') {
            for (; i < s.size() && s[i] != '\n'; i++) s[i] = ' ';
        } else if (c == '/' && i + 1 < s.size() && s[i + 1] == '*') {
            s[i] = s[i + 1] = ' ';
            for (i += 2; i < s.size(); i++) {
                if (s[i] == '*' && i + 1 < s.size() && s[i + 1] == '/') {
                    s[i] = s[i + 1] = ' ';
                    i++;
                    break;
                }
                if (s[i] != '\n') s[i] = ' ';
            }
        }
    }
    in_string = escaped = false;
    for (size_t i = 0; i < s.size(); i++) {
        char c = s[i];
        if (in_string) {
            if (escaped) escaped = false;
            else if (c == '\\') escaped = true;
            else if (c == '"') in_string = false;
            continue;
        }
        if (c == '"') {
            in_string = true;
        } else if (c == ',') {
            size_t j = i + 1;
            while (j < s.size() && (s[j] == ' ' || s[j] == '\n' || s[j] == '\t' || s[j] == '\r')) j++;
            if (j < s.size() && (s[j] == '}' || s[j] == ']')) s[i] = ' ';
        }
    }
    return s;
}

static bool flag(int argc, char** argv, int index) { return argc > index && std::string(argv[index]) == "1"; }

int main(int argc, char** argv) {
    std::string action = argc > 1 ? argv[1] : "format";
    std::string source = argc > 2 ? argv[2] : "";
    int indent = argc > 3 ? std::atoi(argv[3]) : 2;
    if (indent <= 0) indent = 2;
    bool sort_keys = flag(argc, argv, 4);
    bool minify = flag(argc, argv, 5);
    if (flag(argc, argv, 6)) source = strip_jsonc(source);

    std::string out = "{\"engine\":";
    quote(out, ENGINE);
    if (action == "heal") {
        out += ",\"ok\":false,\"unsupported\":true,\"error\":\"Healing broken JSON is only available in Python\",\"line\":null,\"column\":null}";
        std::fputs(out.c_str(), stdout);
        return 0;
    }

    Value root;
    Parser parser{source};
    if (!parser.document(root)) {
        auto [line, column] = position(source, parser.error_pos);
        out += ",\"ok\":false,\"output\":\"\",\"tree\":null,\"summary\":{},\"error\":";
        quote(out, parser.error + " (line " + std::to_string(line) + " column " + std::to_string(column) + ")");
        out += ",\"line\":" + std::to_string(line) + ",\"column\":" + std::to_string(column) + "}";
        std::fputs(out.c_str(), stdout);
        return 0;
    }

    if (action == "analyze") {
        long total = 0, max_depth = 0;
        out += ",\"ok\":true,\"tree\":";
        tree(out, root, "$", "null", 1, total, max_depth);
        out += ",\"summary\":{\"root_type\":\"";
        out += kind_name(root);
        out += "\",\"total_nodes\":" + std::to_string(total) + ",\"max_depth\":" + std::to_string(max_depth) +
               ",\"root_count\":" + std::to_string(root.items.size()) + "},\"error\":\"\",\"line\":null,\"column\":null}";
    } else {
        out += ",\"ok\":true,\"output\":";
        quote(out, render(root, indent, sort_keys, minify));
        out += ",\"error\":\"\",\"line\":null,\"column\":null}";
    }
    std::fputs(out.c_str(), stdout);
    return 0;
}
