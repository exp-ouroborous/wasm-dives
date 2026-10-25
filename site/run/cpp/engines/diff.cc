// The Text Diff tool's C++ engine: a hand-written Myers diff (the standard
// library has none), in linear space: the middle-snake bisection that
// diff-match-patch uses, over line ids. Rows and the unified diff follow
// difflib's layout. argv: left, right, from label, to label. Prints the
// contract's JSON (tests/engines/diff-cases.json).
#include <algorithm>
#include <cstdio>
#include <string>
#include <unordered_map>
#include <vector>

static const char* ENGINE = "C++ (hand-written Myers)";
static const int CONTEXT = 3;

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

// CRLF becomes LF, lines split on LF only; a final newline is not a line.
static std::vector<std::string> split_lines(const std::string& text) {
    std::string normal;
    for (size_t i = 0; i < text.size(); i++) {
        if (text[i] == '\r' && i + 1 < text.size() && text[i + 1] == '\n') continue;
        normal += text[i];
    }
    std::vector<std::string> lines;
    size_t start = 0;
    while (true) {
        size_t end = normal.find('\n', start);
        if (end == std::string::npos) {
            if (start < normal.size()) lines.push_back(normal.substr(start));
            break;
        }
        lines.push_back(normal.substr(start, end - start));
        start = end + 1;
    }
    return lines;
}

// Marks which lines are not on the longest common subsequence.
struct Myers {
    const std::vector<int>& a;
    const std::vector<int>& b;
    std::vector<char>& changed_a;
    std::vector<char>& changed_b;

    void diff(int a0, int a1, int b0, int b1) {
        while (a0 < a1 && b0 < b1 && a[a0] == b[b0]) a0++, b0++;
        while (a0 < a1 && b0 < b1 && a[a1 - 1] == b[b1 - 1]) a1--, b1--;
        if (a0 == a1) {
            for (int j = b0; j < b1; j++) changed_b[j] = 1;
        } else if (b0 == b1) {
            for (int i = a0; i < a1; i++) changed_a[i] = 1;
        } else {
            bisect(a0, a1, b0, b1);
        }
    }

    // Walks forward and backward paths until they overlap, then splits there.
    void bisect(int a0, int a1, int b0, int b1) {
        const int n1 = a1 - a0, n2 = b1 - b0;
        // Diagonals k run from -max_d to max_d, read at k - 1 and k + 1, and the
        // start sentinel sits at k = 1: size the frontiers for all of them.
        const int max_d = (n1 + n2 + 1) / 2, offset = max_d + 1, length = 2 * max_d + 3;
        std::vector<int> v1(length, -1), v2(length, -1);
        v1[offset + 1] = 0;
        v2[offset + 1] = 0;
        const int delta = n1 - n2;
        const bool front = delta % 2 != 0;
        int k1start = 0, k1end = 0, k2start = 0, k2end = 0;
        for (int d = 0; d < max_d; d++) {
            for (int k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
                const int k1_offset = offset + k1;
                int x1 = (k1 == -d || (k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1])) ? v1[k1_offset + 1] : v1[k1_offset - 1] + 1;
                int y1 = x1 - k1;
                while (x1 < n1 && y1 < n2 && a[a0 + x1] == b[b0 + y1]) x1++, y1++;
                v1[k1_offset] = x1;
                if (x1 > n1) {
                    k1end += 2;
                } else if (y1 > n2) {
                    k1start += 2;
                } else if (front) {
                    const int k2_offset = offset + delta - k1;
                    if (k2_offset >= 0 && k2_offset < length && v2[k2_offset] != -1 && x1 >= n1 - v2[k2_offset]) {
                        split(a0, a1, b0, b1, x1, y1);
                        return;
                    }
                }
            }
            for (int k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
                const int k2_offset = offset + k2;
                int x2 = (k2 == -d || (k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1])) ? v2[k2_offset + 1] : v2[k2_offset - 1] + 1;
                int y2 = x2 - k2;
                while (x2 < n1 && y2 < n2 && a[a0 + n1 - x2 - 1] == b[b0 + n2 - y2 - 1]) x2++, y2++;
                v2[k2_offset] = x2;
                if (x2 > n1) {
                    k2end += 2;
                } else if (y2 > n2) {
                    k2start += 2;
                } else if (!front) {
                    const int k1_offset = offset + delta - k2;
                    if (k1_offset >= 0 && k1_offset < length && v1[k1_offset] != -1) {
                        const int x1 = v1[k1_offset];
                        const int y1 = offset + x1 - k1_offset;
                        if (x1 >= n1 - x2) {
                            split(a0, a1, b0, b1, x1, y1);
                            return;
                        }
                    }
                }
            }
        }
        // No common line at all: everything changed.
        for (int i = a0; i < a1; i++) changed_a[i] = 1;
        for (int j = b0; j < b1; j++) changed_b[j] = 1;
    }

    void split(int a0, int a1, int b0, int b1, int x, int y) {
        diff(a0, a0 + x, b0, b0 + y);
        diff(a0 + x, a1, b0 + y, b1);
    }
};

struct Op {
    const char* tag;
    int i1, i2, j1, j2;
};

// Unchanged lines pair up in order; between them, a run of changes holding
// both deletions and insertions is one replace.
static std::vector<Op> opcodes(const std::vector<char>& ca, const std::vector<char>& cb) {
    const int n = static_cast<int>(ca.size()), m = static_cast<int>(cb.size());
    std::vector<Op> ops;
    int i = 0, j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && !ca[i] && !cb[j]) {
            const int si = i, sj = j;
            while (i < n && j < m && !ca[i] && !cb[j]) i++, j++;
            ops.push_back({"equal", si, i, sj, j});
            continue;
        }
        const int si = i, sj = j;
        while (i < n && ca[i]) i++;
        while (j < m && cb[j]) j++;
        if (i == si && j == sj) break;  // cannot happen: unchanged lines pair up
        ops.push_back({i > si && j > sj ? "replace" : i > si ? "delete" : "insert", si, i, sj, j});
    }
    return ops;
}

// difflib.SequenceMatcher.get_grouped_opcodes(n), line for line.
static std::vector<std::vector<Op>> grouped(std::vector<Op> codes) {
    if (codes.empty()) codes.push_back({"equal", 0, 1, 0, 1});
    if (std::string(codes.front().tag) == "equal") {
        Op& c = codes.front();
        c.i1 = std::max(c.i1, c.i2 - CONTEXT);
        c.j1 = std::max(c.j1, c.j2 - CONTEXT);
    }
    if (std::string(codes.back().tag) == "equal") {
        Op& c = codes.back();
        c.i2 = std::min(c.i2, c.i1 + CONTEXT);
        c.j2 = std::min(c.j2, c.j1 + CONTEXT);
    }
    std::vector<std::vector<Op>> groups;
    std::vector<Op> group;
    for (Op c : codes) {
        if (std::string(c.tag) == "equal" && c.i2 - c.i1 > 2 * CONTEXT) {
            group.push_back({"equal", c.i1, std::min(c.i2, c.i1 + CONTEXT), c.j1, std::min(c.j2, c.j1 + CONTEXT)});
            groups.push_back(group);
            group.clear();
            c.i1 = std::max(c.i1, c.i2 - CONTEXT);
            c.j1 = std::max(c.j1, c.j2 - CONTEXT);
        }
        group.push_back(c);
    }
    if (!group.empty() && !(group.size() == 1 && std::string(group[0].tag) == "equal")) groups.push_back(group);
    return groups;
}

// difflib's unified range: "3" for one line, "2,0" style for none.
static std::string range(int start, int stop) {
    const int length = stop - start;
    if (length == 1) return std::to_string(start + 1);
    if (length == 0) return std::to_string(start) + ",0";
    return std::to_string(start + 1) + "," + std::to_string(length);
}

static void row(std::string& out, bool& first, const char* kind, const std::vector<std::string>& left, const std::vector<std::string>& right, int i, int j) {
    if (!first) out += ',';
    first = false;
    out += "{\"kind\":\"";
    out += kind;
    out += "\",\"left_line\":" + (i >= 0 ? std::to_string(i + 1) : std::string("null")) + ",\"left_text\":";
    quote(out, i >= 0 ? left[i] : "");
    out += ",\"right_line\":" + (j >= 0 ? std::to_string(j + 1) : std::string("null")) + ",\"right_text\":";
    quote(out, j >= 0 ? right[j] : "");
    out += '}';
}

int main(int argc, char** argv) {
    // argv[0] is the engine name.
    const std::vector<std::string> left = split_lines(argc > 1 ? argv[1] : "");
    const std::vector<std::string> right = split_lines(argc > 2 ? argv[2] : "");
    std::string from_label = argc > 3 && argv[3][0] ? argv[3] : "left";
    std::string to_label = argc > 4 && argv[4][0] ? argv[4] : "right";

    // Compare lines by id: equal text, equal id.
    std::unordered_map<std::string, int> ids;
    std::vector<int> a, b;
    for (const auto& line : left) a.push_back(ids.emplace(line, static_cast<int>(ids.size())).first->second);
    for (const auto& line : right) b.push_back(ids.emplace(line, static_cast<int>(ids.size())).first->second);
    std::vector<char> ca(a.size(), 0), cb(b.size(), 0);
    Myers{a, b, ca, cb}.diff(0, static_cast<int>(a.size()), 0, static_cast<int>(b.size()));
    const std::vector<Op> ops = opcodes(ca, cb);

    std::vector<std::string> diff;
    for (const auto& group : grouped(ops)) {
        if (diff.empty()) {
            diff.push_back("--- " + from_label);
            diff.push_back("+++ " + to_label);
        }
        diff.push_back("@@ -" + range(group.front().i1, group.back().i2) + " +" + range(group.front().j1, group.back().j2) + " @@");
        for (const Op& op : group) {
            if (std::string(op.tag) == "equal") {
                for (int i = op.i1; i < op.i2; i++) diff.push_back(" " + left[i]);
                continue;
            }
            for (int i = op.i1; i < op.i2; i++) diff.push_back("-" + left[i]);
            for (int j = op.j1; j < op.j2; j++) diff.push_back("+" + right[j]);
        }
    }
    int added = 0, removed = 0, context = 0;
    std::string joined;
    for (size_t k = 0; k < diff.size(); k++) {
        if (k > 0) joined += '\n';
        joined += diff[k];
        if (k < 2) continue;
        if (diff[k][0] == '+') added++;
        else if (diff[k][0] == '-') removed++;
        else if (diff[k][0] == ' ') context++;
    }

    std::string out = "{\"ok\":true,\"engine\":";
    quote(out, ENGINE);
    out += ",\"diff\":";
    quote(out, joined);
    out += ",\"added\":" + std::to_string(added) + ",\"removed\":" + std::to_string(removed) +
           ",\"changed\":" + std::to_string(std::min(added, removed)) + ",\"context\":" + std::to_string(context) + ",\"rows\":[";
    bool first = true;
    for (const Op& op : ops) {
        const bool paired_kind = std::string(op.tag) == "equal" || std::string(op.tag) == "replace";
        const int paired = paired_kind ? std::min(op.i2 - op.i1, op.j2 - op.j1) : 0;
        for (int k = 0; k < paired; k++) row(out, first, op.tag, left, right, op.i1 + k, op.j1 + k);
        // replace: lines beyond the pairs become deletes or inserts
        for (int i = op.i1 + paired; i < op.i2; i++) row(out, first, "delete", left, right, i, -1);
        for (int j = op.j1 + paired; j < op.j2; j++) row(out, first, "insert", left, right, -1, j);
    }
    out += "],\"error\":\"\"}";
    std::fputs(out.c_str(), stdout);
    return 0;
}
