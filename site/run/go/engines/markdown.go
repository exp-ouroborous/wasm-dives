// The Markdown tool's Go engine: goldmark (CommonMark, plus the extensions
// below), compiled into this Yaegi runtime. Handle(input JSON) -> output JSON,
// the contract every language's engine follows
// (tests/engines/markdown-cases.json).
package main

import (
	"bytes"
	"encoding/json"
	"runtime/debug"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer/html"
)

type markdownInput struct {
	Source   string   `json:"source"`
	Features []string `json:"features"`
	Safe     bool     `json:"safe"`
}

// fenced_code is CommonMark: always on, so asking for it is fine.
var supported = map[string]bool{"fenced_code": true, "tables": true, "hard_breaks": true, "footnotes": true, "smarty": true}

// The goldmark version this runtime was built with.
func engineName() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, dep := range info.Deps {
			if dep.Path == "github.com/yuin/goldmark" {
				return "goldmark " + dep.Version
			}
		}
	}
	return "goldmark"
}

func reply(fields map[string]any) string {
	fields["engine"] = engineName()
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(fields)
	return strings.TrimRight(buffer.String(), "\n")
}

func Handle(raw string) string {
	var in markdownInput
	if err := json.Unmarshal([]byte(raw), &in); err != nil {
		return reply(map[string]any{"ok": false, "html": "", "error": err.Error()})
	}
	missing := []string{}
	wanted := map[string]bool{}
	for _, feature := range in.Features {
		if !supported[feature] {
			missing = append(missing, feature)
		}
		wanted[feature] = true
	}
	if len(missing) > 0 {
		return reply(map[string]any{"ok": false, "unsupported": true, "unsupported_features": missing, "html": "",
			"error": strings.Join(missing, ", ") + " is not available in Go"})
	}

	// Each WithExtensions / WithRendererOptions call adds to the ones before.
	options := []goldmark.Option{}
	if wanted["tables"] {
		options = append(options, goldmark.WithExtensions(extension.Table))
	}
	if wanted["footnotes"] {
		options = append(options, goldmark.WithExtensions(extension.Footnote))
	}
	if wanted["smarty"] {
		options = append(options, goldmark.WithExtensions(extension.Typographer))
	}
	if wanted["hard_breaks"] {
		options = append(options, goldmark.WithRendererOptions(html.WithHardWraps()))
	}
	// goldmark's default is already safe: raw HTML is omitted and dangerous
	// URLs (javascript: and the like) are emptied. Unsafe lets both through.
	if !in.Safe {
		options = append(options, goldmark.WithRendererOptions(html.WithUnsafe()))
	}

	var out bytes.Buffer
	if err := goldmark.New(options...).Convert([]byte(in.Source), &out); err != nil {
		return reply(map[string]any{"ok": false, "html": "", "error": err.Error()})
	}
	return reply(map[string]any{"ok": true, "html": out.String(), "error": ""})
}
