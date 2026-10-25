# Phase 6d: Text Diff in every language

> Executed natively, same pattern as phases 6a–6c.

**Goal:** the Text Diff tool diffs two texts by line in Python, C#, Go or
C/C++, each in the wasm-dives sandbox, with the same rows, counts and unified
diff shape the page renders today.

## Diff sources

| Language | Source | Notes |
|---|---|---|
| Python | `difflib.SequenceMatcher` (stdlib) | Ratcliff/Obershelp, as today |
| C# | DiffPlex 1.9.0 (2025-09-13) | NuGet, embedded for Roslyn like Markdig |
| Go | `github.com/sergi/go-diff` v1.4.0 (2025-06-05) | diff-match-patch in line mode, compiled into Yaegi like goldmark |
| C/C++ | hand-written Myers O(ND) | the standard library has no diff |

Different algorithms give different, equally valid diffs, so the contract
checks validity, and pins exact output only where every algorithm agrees.

## Contract

Input `{left, right, from_label, to_label}`.
Output `{ok, engine, diff, added, removed, changed, context, rows}`,
`rows[] = {kind: equal|delete|insert|replace, left_line, left_text, right_line, right_text}`.

- Lines: `\r\n` becomes `\n`, split on `\n`; a final newline is not a line.
  (Python's `splitlines` also splits on `\r`, `\x0b`, ` `…; no longer.)
- Opcodes: a run of changes holding both deletions and insertions is one
  `replace`; its rows pair left and right lines, extras become delete/insert.
- Unified diff: `--- from`, `+++ to`, hunks with 3 lines of context grouped
  as `difflib.get_grouped_opcodes(3)`, ranges as difflib writes them
  (`-3` for one line, `-0,0` for none). `""` when nothing changed.
- `added`/`removed`: changed lines on the right/left; `changed = min`;
  `context`: context lines in the diff.

Checked for every case and engine: rows rebuild both inputs in order with
consecutive line numbers; kinds match which sides are present (and `equal`
texts are equal, `replace` texts differ); counts match the rows and the diff;
applying the diff to the left gives the right.

## Tasks

1. Contract (`tests/engines/diff-cases.json`, `diff-contract.mjs` with a
   unified-diff applier) + Python engine `engines/diff.py`.
2. C# engine on DiffPlex (runner reference + embedded image).
3. Go engine on go-diff (go.mod, `yaegi extract`, LICENSE).
4. C/C++ engine, hand-written Myers.
5. misc-dives page: picker, View source, Stop, live re-run; `tool.py` out.
6. Codex reviews, PRs, deploys, live check, `/learn` Text Diff copy.

## Review focus

- Big inputs: Myers is O(ND); difflib's worst case is quadratic.
- Identical inputs, empty sides, CRLF vs LF, a missing final newline.
- Non-ASCII and emoji lines.
- Hunk merging when changes sit fewer than 7 lines apart.
