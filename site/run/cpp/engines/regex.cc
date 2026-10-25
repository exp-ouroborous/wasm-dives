// The regex tool's C++ engine: analyse a pattern with std::regex (ECMAScript
// grammar). argv: pattern, text, replacement, comma-separated flags. Prints
// the contract's JSON (offsets in Unicode code points; $1 replacements).
#include <cstdio>
#include <regex>
#include <string>
#include <vector>

static const char* ENGINE = "C++ std::regex (ECMAScript)";

static void json_string(std::string& out, const std::string& s) {
    out += '"';
    for (unsigned char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
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

// UTF-8: count the bytes that start a code point.
static long code_points(const std::string& text, long byte_offset) {
    long count = 0;
    for (long i = 0; i < byte_offset; i++) {
        if ((static_cast<unsigned char>(text[i]) & 0xC0) != 0x80) count++;
    }
    return count;
}

static int fail(const std::string& message) {
    std::string out = "{\"ok\":false,\"error\":";
    json_string(out, message);
    out += ",\"engine\":";
    json_string(out, ENGINE);
    out += ",\"match_count\":0,\"matches\":[],\"substitution\":\"\",\"full_match\":false}";
    std::puts(out.c_str());
    return 0;
}

int main(int argc, char** argv) {
    if (argc < 5) return fail("expected pattern, text, replacement and flags");
    const std::string pattern = argv[1], text = argv[2], replacement = argv[3], flags = argv[4];

    auto syntax = std::regex::ECMAScript;
    if (flags.find("ignorecase") != std::string::npos) syntax |= std::regex::icase;
    if (flags.find("multiline") != std::string::npos) syntax |= std::regex::multiline;
    if (flags.find("dotall") != std::string::npos) return fail("dotall is not supported by std::regex");
    if (pattern.find("(?<") != std::string::npos && pattern.find("(?<=") == std::string::npos && pattern.find("(?<!") == std::string::npos) {
        return fail("named groups are not supported by std::regex");
    }
    if (pattern.find("(?P<") != std::string::npos) return fail("named groups are not supported by std::regex");

    const std::regex re(pattern, syntax);  // aborts (traps) on a pattern it rejects

    std::string matches;
    int count = 0;
    for (auto it = std::sregex_iterator(text.begin(), text.end(), re); it != std::sregex_iterator(); ++it) {
        const std::smatch& m = *it;
        if (count) matches += ',';
        count++;
        matches += "{\"index\":" + std::to_string(count) + ",\"match\":";
        json_string(matches, m.str(0));
        matches += ",\"start\":" + std::to_string(code_points(text, m.position(0)));
        matches += ",\"end\":" + std::to_string(code_points(text, m.position(0) + m.length(0)));
        matches += ",\"groups\":{},\"numbered_groups\":[";
        for (size_t g = 1; g < m.size(); g++) {
            if (g > 1) matches += ',';
            if (m[g].matched) json_string(matches, m.str(g));
            else matches += "null";
        }
        matches += "]}";
    }

    std::string out = "{\"ok\":true,\"error\":\"\",\"engine\":";
    json_string(out, ENGINE);
    out += ",\"match_count\":" + std::to_string(count) + ",\"matches\":[" + matches + "],\"substitution\":";
    json_string(out, replacement.empty() ? std::string() : std::regex_replace(text, re, replacement));
    out += ",\"full_match\":";
    out += std::regex_match(text, re) ? "true" : "false";
    out += "}";
    std::puts(out.c_str());
    return 0;
}
