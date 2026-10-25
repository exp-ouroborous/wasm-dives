# Phase 6b: JSON Tool in Every Language — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The JSON pretty printer at /learn/json-pretty-printer/ formats, minifies, sorts, validates and analyses JSON in Python, C#, Go or C/C++, each on its own JSON stack in WebAssembly in the sandbox. It uses the same dropdown, View source and Stop as the regex tester.

**Architecture:** This is the 6a engine path (`call { engine: "json", input }`):
- **Contract cases** in `tests/engines/json-cases.json`, run in Node against all four engines.
- **Protocol:** inputs may now also be booleans and numbers.
- **"Heal"** (heuristic repair of broken JSON) stays Python-only. Other engines return `{ ok: false, unsupported: true }` and the page disables Heal with a label, as the spec requires (no silent fallback).

## The JSON contract

- **Input:** `{ action: "format" | "analyze" | "heal", source, indent: 2 | 4 | 8, sort_keys, minify, allow_jsonc }`.
- **`format`** returns `{ ok, engine, output, error, line, column }`.
  - Indented output uses `", "`-free JSON with `": "` after keys, newlines, and `indent` spaces.
  - Minified output has no spaces.
  - Non-ASCII is written raw.
  - Without `sort_keys`, keys keep their input order; with it, they're sorted by code point.
- **`analyze`** returns `{ ok, engine, tree, summary: { root_type, total_nodes, max_depth, root_count }, error, line, column }`.
  - Each tree node is `{ key, path, type, preview, copy_value, count, children }`.
  - `path` is `$`, then `.key` for `[A-Za-z_][A-Za-z0-9_]*` keys, `["key"]` (JSON-escaped) otherwise, and `[i]` for array items.
  - `preview` is the JSON text of a scalar, or `""` for a container.
  - `copy_value` is the subtree formatted with indent 2 and sorted keys.
- **`allow_jsonc`** strips `//` and `/* */` comments and trailing commas before parsing.
- **Errors** set `ok: false` with a 1-based `line` and a column of at least 1.
- **`engine`** is a display name: "Python json", ".NET System.Text.Json", "Go encoding/json", or "C++ (hand-written parser)".

## Tasks
- [ ] Protocol: allow boolean and number inputs (tests first).
- [ ] Contract cases plus the Python engine (from misc-dives `tool.py`, with `ensure_ascii=False` and the shared path rule).
- [ ] Go engine (token decoder for order; its own encoder for exact formatting; byte offsets to line and column).
- [ ] C# engine (`JsonDocument` with comment and trailing-comma options; `Utf8JsonWriter` with `IndentSize`; raw numbers).
- [ ] C++ engine (a hand-written recursive-descent parser with line and column, the JSONC preprocessor, and a serializer).
- [ ] misc-dives page: dropdown, View source, Stop; Heal disabled outside Python; tool.py removed.
- [ ] Browser verification, then Codex review per repo, PRs, deploys and a live check.
