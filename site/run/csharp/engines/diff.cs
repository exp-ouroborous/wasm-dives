// The Text Diff tool's C# engine: DiffPlex (Myers' algorithm) finds the
// changed blocks; rows and the unified diff follow difflib's layout.
// Engine.Handle(input JSON) -> output JSON, the contract every language's
// engine follows (tests/engines/diff-cases.json).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using DiffPlex;
using DiffPlex.Chunkers;

public static class Engine
{
    static readonly string Name = "DiffPlex " + (typeof(Differ).Assembly
        .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "") + " (Myers)";

    const int Context = 3;

    // Lines as the contract splits them, so DiffPlex compares the same lines.
    sealed class LineChunker : IChunker
    {
        public IReadOnlyList<string> Chunk(string text) => SplitLines(text);
    }

    // CRLF becomes LF, lines split on LF only; a final newline is not a line.
    static string[] SplitLines(string text)
    {
        var lines = text.Replace("\r\n", "\n").Split('\n').ToList();
        if (lines[^1] == "") lines.RemoveAt(lines.Count - 1);
        return [.. lines];
    }

    record Op(string Tag, int I1, int I2, int J1, int J2);

    // DiffPlex reports changed blocks; the gaps between them are equal runs.
    static List<Op> Opcodes(string left, string right, int leftCount, int rightCount)
    {
        var ops = new List<Op>();
        int i = 0, j = 0;
        foreach (var block in Differ.Instance.CreateDiffs(left, right, false, false, new LineChunker()).DiffBlocks)
        {
            if (block.DeleteStartA > i) ops.Add(new("equal", i, block.DeleteStartA, j, block.InsertStartB));
            var tag = block.DeleteCountA > 0 && block.InsertCountB > 0 ? "replace" : block.DeleteCountA > 0 ? "delete" : "insert";
            ops.Add(new(tag, block.DeleteStartA, block.DeleteStartA + block.DeleteCountA, block.InsertStartB, block.InsertStartB + block.InsertCountB));
            i = block.DeleteStartA + block.DeleteCountA;
            j = block.InsertStartB + block.InsertCountB;
        }
        if (i < leftCount || j < rightCount) ops.Add(new("equal", i, leftCount, j, rightCount));
        return ops;
    }

    // difflib.SequenceMatcher.get_grouped_opcodes(n), line for line.
    static List<List<Op>> Grouped(List<Op> opcodes)
    {
        var codes = opcodes.Count > 0 ? new List<Op>(opcodes) : [new("equal", 0, 1, 0, 1)];
        if (codes[0].Tag == "equal")
        {
            var c = codes[0];
            codes[0] = c with { I1 = Math.Max(c.I1, c.I2 - Context), J1 = Math.Max(c.J1, c.J2 - Context) };
        }
        if (codes[^1].Tag == "equal")
        {
            var c = codes[^1];
            codes[^1] = c with { I2 = Math.Min(c.I2, c.I1 + Context), J2 = Math.Min(c.J2, c.J1 + Context) };
        }
        var groups = new List<List<Op>>();
        var group = new List<Op>();
        foreach (var code in codes)
        {
            var (i1, j1) = (code.I1, code.J1);
            if (code.Tag == "equal" && code.I2 - code.I1 > 2 * Context)
            {
                group.Add(code with { I2 = Math.Min(code.I2, code.I1 + Context), J2 = Math.Min(code.J2, code.J1 + Context) });
                groups.Add(group);
                group = [];
                (i1, j1) = (Math.Max(code.I1, code.I2 - Context), Math.Max(code.J1, code.J2 - Context));
            }
            group.Add(code with { I1 = i1, J1 = j1 });
        }
        if (group.Count > 0 && !(group.Count == 1 && group[0].Tag == "equal")) groups.Add(group);
        return groups;
    }

    // difflib's unified range: "3" for one line, "2,0" style for none.
    static string Range(int start, int stop)
    {
        var length = stop - start;
        if (length == 1) return $"{start + 1}";
        return length == 0 ? $"{start},0" : $"{start + 1},{length}";
    }

    public static string Handle(string inputJson)
    {
        using var input = JsonDocument.Parse(inputJson);
        var root = input.RootElement;
        string Text(string name, string fallback) =>
            root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && v.GetString() is { Length: > 0 } s ? s : fallback;
        var leftText = root.TryGetProperty("left", out var l) ? l.GetString() ?? "" : "";
        var rightText = root.TryGetProperty("right", out var r) ? r.GetString() ?? "" : "";
        var left = SplitLines(leftText);
        var right = SplitLines(rightText);
        var opcodes = Opcodes(leftText, rightText, left.Length, right.Length);

        var diff = new List<string>();
        foreach (var group in Grouped(opcodes))
        {
            if (diff.Count == 0)
            {
                diff.Add($"--- {Text("from_label", "left")}");
                diff.Add($"+++ {Text("to_label", "right")}");
            }
            diff.Add($"@@ -{Range(group[0].I1, group[^1].I2)} +{Range(group[0].J1, group[^1].J2)} @@");
            foreach (var op in group)
            {
                if (op.Tag == "equal")
                {
                    for (var i = op.I1; i < op.I2; i++) diff.Add(" " + left[i]);
                    continue;
                }
                for (var i = op.I1; i < op.I2; i++) diff.Add("-" + left[i]);
                for (var j = op.J1; j < op.J2; j++) diff.Add("+" + right[j]);
            }
        }
        var body = diff.Skip(2).ToList();
        var added = body.Count(x => x.StartsWith('+'));
        var removed = body.Count(x => x.StartsWith('-'));

        return Write(json =>
        {
            json.WriteBoolean("ok", true);
            json.WriteString("engine", Name);
            json.WriteString("diff", string.Join('\n', diff));
            json.WriteNumber("added", added);
            json.WriteNumber("removed", removed);
            json.WriteNumber("changed", Math.Min(added, removed));
            json.WriteNumber("context", body.Count(x => x.StartsWith(' ')));
            json.WriteStartArray("rows");
            foreach (var op in opcodes) WriteRows(json, op, left, right);
            json.WriteEndArray();
            json.WriteString("error", "");
        });
    }

    static void WriteRows(Utf8JsonWriter json, Op op, string[] left, string[] right)
    {
        void Row(string kind, int? i, int? j)
        {
            json.WriteStartObject();
            json.WriteString("kind", kind);
            if (i is int li) json.WriteNumber("left_line", li + 1); else json.WriteNull("left_line");
            json.WriteString("left_text", i is int a ? left[a] : "");
            if (j is int rj) json.WriteNumber("right_line", rj + 1); else json.WriteNull("right_line");
            json.WriteString("right_text", j is int b ? right[b] : "");
            json.WriteEndObject();
        }
        var leftCount = op.I2 - op.I1;
        var rightCount = op.J2 - op.J1;
        var paired = op.Tag is "equal" or "replace" ? Math.Min(leftCount, rightCount) : 0;
        for (var k = 0; k < paired; k++) Row(op.Tag, op.I1 + k, op.J1 + k);
        // replace: lines beyond the pairs become deletes or inserts
        for (var i = op.I1 + paired; i < op.I2; i++) Row("delete", i, null);
        for (var j = op.J1 + paired; j < op.J2; j++) Row("insert", null, j);
    }

    static string Write(Action<Utf8JsonWriter> body)
    {
        using var buffer = new System.IO.MemoryStream();
        using (var json = new Utf8JsonWriter(buffer, new JsonWriterOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
        {
            json.WriteStartObject();
            body(json);
            json.WriteEndObject();
        }
        return System.Text.Encoding.UTF8.GetString(buffer.ToArray());
    }
}
