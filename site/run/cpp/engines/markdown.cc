// The Markdown tool's C++ engine: md4c (CommonMark, a C library compiled in
// alongside this file). argv: source, comma-separated features, safe (1/0).
// Prints the contract's JSON (tests/engines/markdown-cases.json).
#include <cctype>
#include <cstdio>
#include <string>
#include <vector>

#include "md4c-html.h"

static const char* ENGINE = "md4c 0.6.0";

static void quote(std::string& out, const std::string& s) {
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

static std::vector<std::string> split(const std::string& csv) {
    std::vector<std::string> parts;
    size_t start = 0;
    while (start < csv.size()) {
        size_t comma = csv.find(',', start);
        if (comma == std::string::npos) comma = csv.size();
        if (comma > start) parts.push_back(csv.substr(start, comma - start));
        start = comma + 1;
    }
    return parts;
}

// md4c-html escapes &, <, > and " in attributes; undo that, drop whitespace
// and control characters (browsers ignore them in a scheme), and allow only
// relative URLs and http, https and mailto.
static bool safe_url(const std::string& escaped) {
    std::string url;
    for (size_t i = 0; i < escaped.size(); i++) {
        if (escaped[i] == '&') {
            size_t semi = escaped.find(';', i);
            if (semi != std::string::npos) {
                std::string entity = escaped.substr(i, semi - i + 1);
                if (entity == "&amp;") url += '&';
                else if (entity == "&lt;") url += '<';
                else if (entity == "&gt;") url += '>';
                else if (entity == "&quot;") url += '"';
                else url += entity;
                i = semi;
                continue;
            }
        }
        if (static_cast<unsigned char>(escaped[i]) > ' ') url += static_cast<char>(std::tolower(static_cast<unsigned char>(escaped[i])));
    }
    size_t colon = url.find(':');
    if (colon == std::string::npos || !std::isalpha(static_cast<unsigned char>(url[0]))) return true;
    for (size_t i = 1; i < colon; i++) {
        char c = url[i];
        if (!std::isalnum(static_cast<unsigned char>(c)) && c != '+' && c != '.' && c != '-') return true;  // not a scheme: relative
    }
    std::string scheme = url.substr(0, colon);
    return scheme == "http" || scheme == "https" || scheme == "mailto";
}

// md4c does not filter URLs, so safe mode empties dangerous href/src values.
// With raw HTML off, a literal href=" in text is escaped, so every match here
// is an attribute md4c wrote.
static void clean_urls(std::string& html) {
    for (const char* attribute : {" href=\"", " src=\""}) {
        size_t at = 0;
        std::string marker = attribute;
        while ((at = html.find(marker, at)) != std::string::npos) {
            size_t start = at + marker.size();
            size_t end = html.find('"', start);
            if (end == std::string::npos) break;
            if (!safe_url(html.substr(start, end - start))) {
                html.erase(start, end - start);
                end = start;
            }
            at = end;
        }
    }
}

static void append(const MD_CHAR* text, MD_SIZE size, void* userdata) {
    static_cast<std::string*>(userdata)->append(text, size);
}

int main(int argc, char** argv) {
    // argv[0] is the engine name.
    std::string source = argc > 1 ? argv[1] : "";
    std::vector<std::string> features = split(argc > 2 ? argv[2] : "");
    bool safe = argc > 3 && std::string(argv[3]) == "1";

    std::string out = "{\"engine\":";
    quote(out, ENGINE);

    unsigned flags = 0;  // plain CommonMark: fenced code is always on
    std::vector<std::string> missing;
    for (const std::string& feature : features) {
        if (feature == "fenced_code") continue;
        else if (feature == "tables") flags |= MD_FLAG_TABLES;
        else if (feature == "hard_breaks") flags |= MD_FLAG_HARD_SOFT_BREAKS;
        else missing.push_back(feature);
    }
    if (!missing.empty()) {
        std::string list;
        out += ",\"ok\":false,\"unsupported\":true,\"unsupported_features\":[";
        for (size_t i = 0; i < missing.size(); i++) {
            if (i > 0) {
                out += ',';
                list += ", ";
            }
            quote(out, missing[i]);
            list += missing[i];
        }
        out += "],\"html\":\"\",\"error\":";
        quote(out, list + " is not available in C/C++");
        out += "}";
        std::fputs(out.c_str(), stdout);
        return 0;
    }
    if (safe) flags |= MD_FLAG_NOHTML;

    std::string html;
    if (md_html(source.data(), static_cast<MD_SIZE>(source.size()), append, &html, flags, 0) != 0) {
        out += ",\"ok\":false,\"html\":\"\",\"error\":\"md4c could not parse the input\"}";
        std::fputs(out.c_str(), stdout);
        return 0;
    }
    if (safe) clean_urls(html);
    out += ",\"ok\":true,\"html\":";
    quote(out, html);
    out += ",\"error\":\"\"}";
    std::fputs(out.c_str(), stdout);
    return 0;
}
