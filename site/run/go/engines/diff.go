// The Text Diff tool's Go engine: go-diff (diff-match-patch, Myers' algorithm)
// in line mode, compiled into this Yaegi runtime; rows and the unified diff
// follow difflib's layout. Handle(input JSON) -> output JSON, the contract
// every language's engine follows (tests/engines/diff-cases.json).
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"runtime/debug"
	"strings"

	"github.com/sergi/go-diff/diffmatchpatch"
)

const diffContext = 3

type diffInput struct {
	Left      string `json:"left"`
	Right     string `json:"right"`
	FromLabel string `json:"from_label"`
	ToLabel   string `json:"to_label"`
}

type opcode struct {
	tag            string
	i1, i2, j1, j2 int
}

type diffRow struct {
	Kind      string `json:"kind"`
	LeftLine  *int   `json:"left_line"`
	LeftText  string `json:"left_text"`
	RightLine *int   `json:"right_line"`
	RightText string `json:"right_text"`
}

// Yaegi predates Go 1.21's min and max builtins.
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// CRLF becomes LF, lines split on LF only; a final newline is not a line.
func splitLines(text string) []string {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	if lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

// go-diff's line mode diffs whole lines (each ending in "\n"); a run of
// changes holding both deletions and insertions becomes one replace.
func diffOpcodes(left, right []string) []opcode {
	dmp := diffmatchpatch.New()
	a, b, lines := dmp.DiffLinesToChars(joinLines(left), joinLines(right))
	diffs := dmp.DiffCharsToLines(dmp.DiffMain(a, b, false), lines)
	ops := []opcode{}
	// i, j: lines consumed on each side; startI, startJ: where the current
	// run of changes began. (Plain ints: no closure over mutable state,
	// which Yaegi captures by value.)
	i, j, startI, startJ := 0, 0, 0, 0
	for _, d := range diffs {
		n := strings.Count(d.Text, "\n")
		switch d.Type {
		case diffmatchpatch.DiffEqual:
			ops = appendChange(ops, startI, i, startJ, j)
			ops = append(ops, opcode{"equal", i, i + n, j, j + n})
			i += n
			j += n
			startI, startJ = i, j
		case diffmatchpatch.DiffDelete:
			i += n
		case diffmatchpatch.DiffInsert:
			j += n
		}
	}
	return appendChange(ops, startI, i, startJ, j)
}

// appendChange adds the run of changes left[i1:i2] -> right[j1:j2], if any.
func appendChange(ops []opcode, i1, i2, j1, j2 int) []opcode {
	switch {
	case i2 > i1 && j2 > j1:
		return append(ops, opcode{"replace", i1, i2, j1, j2})
	case i2 > i1:
		return append(ops, opcode{"delete", i1, i2, j1, j2})
	case j2 > j1:
		return append(ops, opcode{"insert", i1, i2, j1, j2})
	}
	return ops
}

func joinLines(lines []string) string {
	var b strings.Builder
	for _, line := range lines {
		b.WriteString(line)
		b.WriteByte('\n')
	}
	return b.String()
}

// difflib.SequenceMatcher.get_grouped_opcodes(n), line for line.
func groupedOpcodes(opcodes []opcode) [][]opcode {
	codes := append([]opcode{}, opcodes...)
	if len(codes) == 0 {
		codes = []opcode{{"equal", 0, 1, 0, 1}}
	}
	if codes[0].tag == "equal" {
		c := &codes[0]
		c.i1, c.j1 = maxInt(c.i1, c.i2-diffContext), maxInt(c.j1, c.j2-diffContext)
	}
	if last := &codes[len(codes)-1]; last.tag == "equal" {
		last.i2, last.j2 = minInt(last.i2, last.i1+diffContext), minInt(last.j2, last.j1+diffContext)
	}
	groups := [][]opcode{}
	group := []opcode{}
	for _, c := range codes {
		if c.tag == "equal" && c.i2-c.i1 > 2*diffContext {
			group = append(group, opcode{"equal", c.i1, minInt(c.i2, c.i1+diffContext), c.j1, minInt(c.j2, c.j1+diffContext)})
			groups = append(groups, group)
			group = []opcode{}
			c.i1, c.j1 = maxInt(c.i1, c.i2-diffContext), maxInt(c.j1, c.j2-diffContext)
		}
		group = append(group, c)
	}
	if len(group) > 0 && !(len(group) == 1 && group[0].tag == "equal") {
		groups = append(groups, group)
	}
	return groups
}

// difflib's unified range: "3" for one line, "2,0" style for none.
func unifiedRange(start, stop int) string {
	switch length := stop - start; length {
	case 1:
		return fmt.Sprint(start + 1)
	case 0:
		return fmt.Sprintf("%d,0", start)
	default:
		return fmt.Sprintf("%d,%d", start+1, length)
	}
}

func diffRows(ops []opcode, left, right []string) []diffRow {
	rows := []diffRow{}
	row := func(kind string, i, j int) {
		r := diffRow{Kind: kind}
		if i >= 0 {
			n := i + 1
			r.LeftLine, r.LeftText = &n, left[i]
		}
		if j >= 0 {
			n := j + 1
			r.RightLine, r.RightText = &n, right[j]
		}
		rows = append(rows, r)
	}
	for _, op := range ops {
		paired := 0
		if op.tag == "equal" || op.tag == "replace" {
			paired = minInt(op.i2-op.i1, op.j2-op.j1)
		}
		for k := 0; k < paired; k++ {
			row(op.tag, op.i1+k, op.j1+k)
		}
		// replace: lines beyond the pairs become deletes or inserts
		for i := op.i1 + paired; i < op.i2; i++ {
			row("delete", i, -1)
		}
		for j := op.j1 + paired; j < op.j2; j++ {
			row("insert", -1, j)
		}
	}
	return rows
}

// The go-diff version this runtime was built with.
func diffEngineName() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, dep := range info.Deps {
			if dep.Path == "github.com/sergi/go-diff" {
				return "go-diff " + dep.Version + " (Myers)"
			}
		}
	}
	return "go-diff (Myers)"
}

func Handle(raw string) string {
	var in diffInput
	if err := json.Unmarshal([]byte(raw), &in); err != nil {
		return `{"ok":false,"engine":"go-diff","error":` + fmt.Sprintf("%q", err.Error()) + `}`
	}
	if in.FromLabel == "" {
		in.FromLabel = "left"
	}
	if in.ToLabel == "" {
		in.ToLabel = "right"
	}
	left, right := splitLines(in.Left), splitLines(in.Right)
	ops := diffOpcodes(left, right)

	diff := []string{}
	for _, group := range groupedOpcodes(ops) {
		if len(diff) == 0 {
			diff = append(diff, "--- "+in.FromLabel, "+++ "+in.ToLabel)
		}
		first, last := group[0], group[len(group)-1]
		diff = append(diff, "@@ -"+unifiedRange(first.i1, last.i2)+" +"+unifiedRange(first.j1, last.j2)+" @@")
		for _, op := range group {
			if op.tag == "equal" {
				for _, line := range left[op.i1:op.i2] {
					diff = append(diff, " "+line)
				}
				continue
			}
			for _, line := range left[op.i1:op.i2] {
				diff = append(diff, "-"+line)
			}
			for _, line := range right[op.j1:op.j2] {
				diff = append(diff, "+"+line)
			}
		}
	}
	added, removed, context := 0, 0, 0
	if len(diff) > 2 {
		for _, line := range diff[2:] {
			switch line[0] {
			case '+':
				added++
			case '-':
				removed++
			case ' ':
				context++
			}
		}
	}

	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(map[string]any{
		"ok": true, "engine": diffEngineName(), "diff": strings.Join(diff, "\n"),
		"added": added, "removed": removed, "changed": minInt(added, removed), "context": context,
		"rows": diffRows(ops, left, right), "error": "",
	})
	return strings.TrimRight(buffer.String(), "\n")
}
