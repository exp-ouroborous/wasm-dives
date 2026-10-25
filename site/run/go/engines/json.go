// The JSON tool's Go engine: format, minify, validate and analyse JSON with
// Go's encoding/json token decoder (which keeps key order and number text).
// Handle(input JSON) -> output JSON, the contract every language's engine
// follows (see tests/engines/json-cases.json). Healing is Python-only.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

const jsonEngine = "Go encoding/json"

var identifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

type jsonInput struct {
	Action     string `json:"action"`
	Source     string `json:"source"`
	Indent     int    `json:"indent"`
	SortKeys   bool   `json:"sort_keys"`
	Minify     bool   `json:"minify"`
	AllowJSONC bool   `json:"allow_jsonc"`
}

// value is a parsed JSON value that remembers key order and number text.
type value struct {
	kind  string // object, array, string, number, boolean, null
	keys  []string
	items []*value
	text  string // string contents, or number text
	truth bool
}

type treeNode struct {
	Key       any         `json:"key"`
	Path      string      `json:"path"`
	Type      string      `json:"type"`
	Preview   string      `json:"preview"`
	CopyValue string      `json:"copy_value"`
	Count     int         `json:"count"`
	Children  []*treeNode `json:"children"`
}

type parseError struct {
	message string
	offset  int64
}

func (e *parseError) Error() string { return e.message }

func read(dec *json.Decoder) (*value, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			v := &value{kind: "object"}
			for dec.More() {
				keyToken, err := dec.Token()
				if err != nil {
					return nil, err
				}
				key, ok := keyToken.(string)
				if !ok {
					return nil, &parseError{"expected a string key", dec.InputOffset()}
				}
				child, err := read(dec)
				if err != nil {
					return nil, err
				}
				v.keys = append(v.keys, key)
				v.items = append(v.items, child)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return v, nil
		case '[':
			v := &value{kind: "array"}
			for dec.More() {
				child, err := read(dec)
				if err != nil {
					return nil, err
				}
				v.items = append(v.items, child)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return v, nil
		}
		return nil, &parseError{"unexpected " + t.String(), dec.InputOffset()}
	case string:
		return &value{kind: "string", text: t}, nil
	case json.Number:
		return &value{kind: "number", text: t.String()}, nil
	case bool:
		return &value{kind: "boolean", truth: t}, nil
	case nil:
		return &value{kind: "null"}, nil
	}
	return nil, &parseError{"unexpected token", dec.InputOffset()}
}

func parse(source string) (*value, error) {
	dec := json.NewDecoder(strings.NewReader(source))
	dec.UseNumber()
	v, err := read(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, &parseError{"unexpected data after the top-level value", dec.InputOffset()}
	}
	return v, nil
}

// position turns an error into a 1-based line and column (in code points).
func position(source string, err error) (int, int) {
	offset := int64(len(source))
	// A type switch, not errors.As: Yaegi panics on errors.As with an interpreted type.
	switch e := err.(type) {
	case *json.SyntaxError:
		offset = e.Offset
	case *parseError:
		offset = e.offset
	}
	if offset > int64(len(source)) {
		offset = int64(len(source))
	}
	before := source[:offset]
	line := strings.Count(before, "\n") + 1
	column := utf8.RuneCountInString(before[strings.LastIndex(before, "\n")+1:]) + 1
	return line, column
}

func writeString(out *strings.Builder, s string) {
	out.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			out.WriteString(`\"`)
		case '\\':
			out.WriteString(`\\`)
		case '\n':
			out.WriteString(`\n`)
		case '\r':
			out.WriteString(`\r`)
		case '\t':
			out.WriteString(`\t`)
		case '\b':
			out.WriteString(`\b`)
		case '\f':
			out.WriteString(`\f`)
		default:
			if r < 0x20 {
				out.WriteString(`\u00`)
				out.WriteString(strconv.FormatInt(int64(r)>>4, 16))
				out.WriteString(strconv.FormatInt(int64(r)&0xF, 16))
			} else {
				out.WriteRune(r)
			}
		}
	}
	out.WriteByte('"')
}

func order(v *value, sortKeys bool) []int {
	indexes := make([]int, len(v.items))
	for i := range indexes {
		indexes[i] = i
	}
	if sortKeys && v.kind == "object" {
		sort.SliceStable(indexes, func(a, b int) bool { return v.keys[indexes[a]] < v.keys[indexes[b]] })
	}
	return indexes
}

func encode(out *strings.Builder, v *value, indent int, level int, sortKeys bool, minify bool) {
	switch v.kind {
	case "string":
		writeString(out, v.text)
	case "number":
		out.WriteString(v.text)
	case "boolean":
		out.WriteString(strconv.FormatBool(v.truth))
	case "null":
		out.WriteString("null")
	default:
		open, close := "[", "]"
		if v.kind == "object" {
			open, close = "{", "}"
		}
		out.WriteString(open)
		if len(v.items) == 0 {
			out.WriteString(close)
			return
		}
		pad := func(depth int) {
			if !minify {
				out.WriteByte('\n')
				out.WriteString(strings.Repeat(" ", indent*depth))
			}
		}
		for n, i := range order(v, sortKeys) {
			if n > 0 {
				out.WriteByte(',')
			}
			pad(level + 1)
			if v.kind == "object" {
				writeString(out, v.keys[i])
				if minify {
					out.WriteByte(':')
				} else {
					out.WriteString(": ")
				}
			}
			encode(out, v.items[i], indent, level+1, sortKeys, minify)
		}
		pad(level)
		out.WriteString(close)
	}
}

func render(v *value, indent int, sortKeys bool, minify bool) string {
	var out strings.Builder
	encode(&out, v, indent, 0, sortKeys, minify)
	return out.String()
}

func childPath(parent string, key string) string {
	if identifier.MatchString(key) {
		return parent + "." + key
	}
	var quoted strings.Builder
	writeString(&quoted, key)
	return parent + "[" + quoted.String() + "]"
}

func tree(v *value, path string, key any, depth int, total *int, maxDepth *int) *treeNode {
	*total++
	if depth > *maxDepth {
		*maxDepth = depth
	}
	node := &treeNode{Key: key, Path: path, Type: v.kind, CopyValue: render(v, 2, true, false), Children: []*treeNode{}}
	if v.kind == "object" || v.kind == "array" {
		node.Count = len(v.items)
		for i, child := range v.items {
			if v.kind == "object" {
				node.Children = append(node.Children, tree(child, childPath(path, v.keys[i]), v.keys[i], depth+1, total, maxDepth))
			} else {
				node.Children = append(node.Children, tree(child, path+"["+strconv.Itoa(i)+"]", i, depth+1, total, maxDepth))
			}
		}
	} else {
		node.Preview = render(v, 0, false, true)
	}
	return node
}

// stripJSONC blanks out // and /* */ comments (keeping newlines, so error
// positions stay true) and trailing commas before } or ].
func stripJSONC(source string) string {
	in := []rune(source)
	out := make([]rune, len(in))
	copy(out, in)
	inString, escaped := false, false
	for i := 0; i < len(in); i++ {
		c := in[i]
		if inString {
			if escaped {
				escaped = false
			} else if c == '\\' {
				escaped = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		if c == '"' {
			inString = true
			continue
		}
		if c == '/' && i+1 < len(in) && in[i+1] == '/' {
			for ; i < len(in) && in[i] != '\n'; i++ {
				out[i] = ' '
			}
			continue
		}
		if c == '/' && i+1 < len(in) && in[i+1] == '*' {
			out[i], out[i+1] = ' ', ' '
			for i += 2; i < len(in); i++ {
				if in[i] == '*' && i+1 < len(in) && in[i+1] == '/' {
					out[i], out[i+1] = ' ', ' '
					i++
					break
				}
				if in[i] != '\n' {
					out[i] = ' '
				}
			}
		}
	}
	// Trailing commas: a comma whose next non-space character closes a container.
	inString, escaped = false, false
	for i := 0; i < len(out); i++ {
		c := out[i]
		if inString {
			if escaped {
				escaped = false
			} else if c == '\\' {
				escaped = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		if c == '"' {
			inString = true
			continue
		}
		if c == ',' {
			j := i + 1
			for j < len(out) && (out[j] == ' ' || out[j] == '\n' || out[j] == '\t' || out[j] == '\r') {
				j++
			}
			if j < len(out) && (out[j] == '}' || out[j] == ']') {
				out[i] = ' '
			}
		}
	}
	return string(out)
}

func respond(fields map[string]any) string {
	fields["engine"] = jsonEngine
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(fields)
	return strings.TrimRight(buffer.String(), "\n")
}

func failure(source string, err error) string {
	line, column := position(source, err)
	message := err.Error()
	if err == io.EOF || err == io.ErrUnexpectedEOF {
		message = "Unexpected end of input"
	}
	return respond(map[string]any{"ok": false, "output": "", "tree": nil, "summary": map[string]any{}, "error": message, "line": line, "column": column})
}

func Handle(raw string) string {
	var in jsonInput
	if err := json.Unmarshal([]byte(raw), &in); err != nil {
		return respond(map[string]any{"ok": false, "error": err.Error(), "line": 1, "column": 1})
	}
	if in.Action == "heal" {
		return respond(map[string]any{"ok": false, "unsupported": true, "error": "Healing broken JSON is only available in Python", "line": nil, "column": nil})
	}
	source := in.Source
	if in.AllowJSONC {
		source = stripJSONC(source)
	}
	if in.Indent <= 0 {
		in.Indent = 2
	}
	v, err := parse(source)
	if err != nil {
		return failure(source, err)
	}
	if in.Action == "analyze" {
		total, maxDepth := 0, 0
		root := tree(v, "$", nil, 1, &total, &maxDepth)
		return respond(map[string]any{
			"ok":      true,
			"tree":    root,
			"summary": map[string]any{"root_type": root.Type, "total_nodes": total, "max_depth": maxDepth, "root_count": root.Count},
			"error":   "",
			"line":    nil,
			"column":  nil,
		})
	}
	return respond(map[string]any{"ok": true, "output": render(v, in.Indent, in.SortKeys, in.Minify), "error": "", "line": nil, "column": nil})
}
