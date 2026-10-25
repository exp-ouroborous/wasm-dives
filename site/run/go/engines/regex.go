// The regex tool's Go engine: analyse a pattern with Go's regexp (RE2).
// Handle(input JSON) -> output JSON, the contract every language's engine
// follows (offsets in Unicode code points; replacements written $1 / $name).
package main

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode/utf8"
)

const engine = "Go regexp (RE2)"

type regexInput struct {
	Pattern     string   `json:"pattern"`
	Text        string   `json:"text"`
	Flags       []string `json:"flags"`
	Replacement string   `json:"replacement"`
}

type regexMatch struct {
	Index    int                `json:"index"`
	Match    string             `json:"match"`
	Start    int                `json:"start"`
	End      int                `json:"end"`
	Groups   map[string]*string `json:"groups"`
	Numbered []*string          `json:"numbered_groups"`
}

type regexOutput struct {
	OK           bool         `json:"ok"`
	Error        string       `json:"error"`
	Engine       string       `json:"engine"`
	MatchCount   int          `json:"match_count"`
	Matches      []regexMatch `json:"matches"`
	Substitution string       `json:"substitution"`
	FullMatch    bool         `json:"full_match"`
}

func encode(out regexOutput) string {
	bytes, _ := json.Marshal(out)
	return string(bytes)
}

func failure(message string) string {
	return encode(regexOutput{OK: false, Error: message, Engine: engine, Matches: []regexMatch{}})
}

// codePoints turns a byte offset into a count of Unicode code points.
func codePoints(text string, byteOffset int) int {
	return utf8.RuneCountInString(text[:byteOffset])
}

// template turns $1 / $name into Go's ${1} / ${name}, so "$1x" cannot be read as group "1x".
func template(replacement string) string {
	var out strings.Builder
	for i := 0; i < len(replacement); i++ {
		c := replacement[i]
		if c != '$' || i+1 >= len(replacement) {
			out.WriteByte(c)
			continue
		}
		j := i + 1
		for j < len(replacement) && (replacement[j] == '_' || replacement[j] >= '0' && replacement[j] <= '9' || replacement[j] >= 'a' && replacement[j] <= 'z' || replacement[j] >= 'A' && replacement[j] <= 'Z') {
			j++
		}
		if j == i+1 {
			out.WriteString("$$")
			continue
		}
		out.WriteString("${" + replacement[i+1:j] + "}")
		i = j - 1
	}
	return out.String()
}

func Handle(raw string) string {
	var in regexInput
	if err := json.Unmarshal([]byte(raw), &in); err != nil {
		return failure(err.Error())
	}
	flags := ""
	for _, flag := range in.Flags {
		switch flag {
		case "ignorecase":
			flags += "i"
		case "multiline":
			flags += "m"
		case "dotall":
			flags += "s"
		}
	}
	prefix := ""
	if flags != "" {
		prefix = "(?" + flags + ")"
	}
	re, err := regexp.Compile(prefix + in.Pattern)
	if err != nil {
		return failure(err.Error())
	}
	full := regexp.MustCompile(prefix + `\A(?:` + in.Pattern + `)\z`)

	out := regexOutput{OK: true, Engine: engine, Matches: []regexMatch{}}
	names := re.SubexpNames()
	for i, loc := range re.FindAllStringSubmatchIndex(in.Text, -1) {
		m := regexMatch{
			Index:    i + 1,
			Match:    in.Text[loc[0]:loc[1]],
			Start:    codePoints(in.Text, loc[0]),
			End:      codePoints(in.Text, loc[1]),
			Groups:   map[string]*string{},
			Numbered: []*string{},
		}
		for g := 1; g < len(names); g++ {
			var value *string
			if loc[2*g] >= 0 {
				text := in.Text[loc[2*g]:loc[2*g+1]]
				value = &text
			}
			m.Numbered = append(m.Numbered, value)
			if names[g] != "" {
				m.Groups[names[g]] = value
			}
		}
		out.Matches = append(out.Matches, m)
	}
	out.MatchCount = len(out.Matches)
	if in.Replacement != "" {
		out.Substitution = re.ReplaceAllString(in.Text, template(in.Replacement))
	}
	out.FullMatch = full.MatchString(in.Text)
	return encode(out)
}
