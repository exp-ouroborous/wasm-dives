package main

import "reflect"

// Symbols exposes compiled libraries to interpreted code, beyond Yaegi's
// stdlib. Filled by the github_com-*.go files, generated with
// `yaegi extract` (see scripts/yaegi.mjs): goldmark for the Markdown engine.
//
//go:generate go run github.com/traefik/yaegi/cmd/yaegi extract -name main github.com/yuin/goldmark github.com/yuin/goldmark/extension github.com/yuin/goldmark/renderer/html
var Symbols = map[string]map[string]reflect.Value{}
