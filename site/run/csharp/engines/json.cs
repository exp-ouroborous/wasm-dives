// The JSON tool's C# engine: format, minify, validate and analyse JSON with
// .NET's System.Text.Json (JsonDocument keeps key order and number text).
// Engine.Handle(input JSON) -> output JSON, the contract every language's
// engine follows (see tests/engines/json-cases.json). Healing is Python-only.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

public static class Engine
{
    const string Name = ".NET System.Text.Json";

    static readonly Regex Identifier = new(@"^[A-Za-z_][A-Za-z0-9_]*$");

    public static string Handle(string inputJson)
    {
        using var input = JsonDocument.Parse(inputJson);
        var root = input.RootElement;
        var action = Text(root, "action") ?? "format";
        var source = Text(root, "source") ?? "";
        var indent = root.TryGetProperty("indent", out var i) && i.ValueKind == JsonValueKind.Number ? i.GetInt32() : 2;
        if (indent <= 0) indent = 2;
        var sortKeys = Flag(root, "sort_keys");
        var minify = Flag(root, "minify");
        var jsonc = Flag(root, "allow_jsonc");

        if (action == "heal")
        {
            return Write(json =>
            {
                json.WriteBoolean("ok", false);
                json.WriteBoolean("unsupported", true);
                json.WriteString("engine", Name);
                json.WriteString("error", "Healing broken JSON is only available in Python");
                json.WriteNull("line");
                json.WriteNull("column");
            });
        }

        // JSONC: System.Text.Json skips comments and trailing commas itself.
        var options = new JsonDocumentOptions
        {
            CommentHandling = jsonc ? JsonCommentHandling.Skip : JsonCommentHandling.Disallow,
            AllowTrailingCommas = jsonc,
        };
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(ReplaceLoneSurrogates(source), options);
        }
        catch (JsonException error)
        {
            var (line, column) = Position(source, error);
            return Write(json =>
            {
                json.WriteBoolean("ok", false);
                json.WriteString("engine", Name);
                json.WriteString("output", "");
                json.WriteNull("tree");
                json.WriteStartObject("summary");
                json.WriteEndObject();
                json.WriteString("error", error.Message);
                json.WriteNumber("line", line);
                json.WriteNumber("column", column);
            });
        }

        using (document)
        {
            var value = document.RootElement;
            if (action == "analyze")
            {
                var total = 0;
                var maxDepth = 0;
                return Write(json =>
                {
                    json.WriteBoolean("ok", true);
                    json.WriteString("engine", Name);
                    json.WritePropertyName("tree");
                    WriteNode(json, value, "$", null, 1, ref total, ref maxDepth);
                    json.WriteStartObject("summary");
                    json.WriteString("root_type", Kind(value));
                    json.WriteNumber("total_nodes", total);
                    json.WriteNumber("max_depth", maxDepth);
                    json.WriteNumber("root_count", Count(value));
                    json.WriteEndObject();
                    json.WriteString("error", "");
                    json.WriteNull("line");
                    json.WriteNull("column");
                });
            }
            var output = Render(value, indent, sortKeys, minify);
            return Write(json =>
            {
                json.WriteBoolean("ok", true);
                json.WriteString("engine", Name);
                json.WriteString("output", output);
                json.WriteString("error", "");
                json.WriteNull("line");
                json.WriteNull("column");
            });
        }
    }

    // GetString() throws on an unpaired \uD8xx/\uDCxx escape, so swap each one
    // for \ufffd first (same length: error positions stay true).
    static string ReplaceLoneSurrogates(string source)
    {
        static int Hex(string s, int at) =>
            at + 6 <= s.Length && s[at] == '\\' && s[at + 1] == 'u' && int.TryParse(s.AsSpan(at + 2, 4), System.Globalization.NumberStyles.HexNumber, null, out var v) ? v : -1;
        // Every backslash starts an escape: outside a string one is invalid JSON
        // anyway, so no string tracking is needed (comments can't fool it).
        var output = new StringBuilder(source.Length);
        for (var i = 0; i < source.Length; i++)
        {
            var c = source[i];
            if (c != '\\' || i + 1 >= source.Length)
            {
                output.Append(c);
                continue;
            }
            var unit = Hex(source, i);
            if (unit is >= 0xD800 and <= 0xDBFF && Hex(source, i + 6) is >= 0xDC00 and <= 0xDFFF)
            {
                output.Append(source, i, 12);
                i += 11;
            }
            else if (unit is >= 0xD800 and <= 0xDFFF)
            {
                output.Append("\\ufffd");
                i += 5;
            }
            else
            {
                output.Append(source, i, 2);  // any other escape, including \\ and \"
                i += 1;
            }
        }
        return output.ToString();
    }

    static string? Text(JsonElement root, string name) =>
        root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    static bool Flag(JsonElement root, string name) =>
        root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;

    // Sort keys by Unicode code point, like the other engines. Ordinal compares
    // UTF-16 units, which puts U+1F600 (a surrogate pair) before U+E000.
    static readonly Comparer<string?> CodePointOrder = Comparer<string?>.Create((a, b) =>
    {
        var left = (a ?? "").EnumerateRunes().GetEnumerator();
        var right = (b ?? "").EnumerateRunes().GetEnumerator();
        while (true)
        {
            var moreLeft = left.MoveNext();
            var moreRight = right.MoveNext();
            if (!moreLeft || !moreRight) return moreLeft.CompareTo(moreRight);
            var order = left.Current.Value.CompareTo(right.Current.Value);
            if (order != 0) return order;
        }
    });

    static string Kind(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => "object",
        JsonValueKind.Array => "array",
        JsonValueKind.String => "string",
        JsonValueKind.Number => "number",
        JsonValueKind.True or JsonValueKind.False => "boolean",
        _ => "null",
    };

    static int Count(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => value.EnumerateObject().Count(),
        JsonValueKind.Array => value.GetArrayLength(),
        _ => 0,
    };

    // The reader reports a 0-based line and a 0-based byte offset in that line;
    // the contract wants 1-based line and column, the column in code points.
    static (long line, long column) Position(string source, JsonException error)
    {
        var lines = source.Split('\n');
        var line = Math.Clamp(error.LineNumber ?? 0, 0, lines.Length - 1);
        var bytes = Encoding.UTF8.GetBytes(lines[line]);
        var offset = (int)Math.Clamp(error.BytePositionInLine ?? 0, 0, bytes.Length);
        var before = Encoding.UTF8.GetString(bytes, 0, offset);
        return (line + 1, before.EnumerateRunes().Count() + 1);
    }

    static void Quote(StringBuilder output, string text)
    {
        output.Append('"');
        foreach (var c in text)
        {
            switch (c)
            {
                case '"': output.Append("\\\""); break;
                case '\\': output.Append("\\\\"); break;
                case '\n': output.Append("\\n"); break;
                case '\r': output.Append("\\r"); break;
                case '\t': output.Append("\\t"); break;
                case '\b': output.Append("\\b"); break;
                case '\f': output.Append("\\f"); break;
                default:
                    if (c < 0x20) output.Append("\\u").Append(((int)c).ToString("x4"));
                    else output.Append(c);
                    break;
            }
        }
        output.Append('"');
    }

    static void Encode(StringBuilder output, JsonElement value, int indent, int level, bool sortKeys, bool minify)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.String: Quote(output, value.GetString() ?? ""); return;
            case JsonValueKind.Number: output.Append(value.GetRawText()); return;
            case JsonValueKind.True: output.Append("true"); return;
            case JsonValueKind.False: output.Append("false"); return;
            case JsonValueKind.Null: output.Append("null"); return;
        }
        var isObject = value.ValueKind == JsonValueKind.Object;
        var members = isObject
            ? value.EnumerateObject().Select(p => (key: (string?)p.Name, item: p.Value)).ToList()
            : value.EnumerateArray().Select(item => (key: (string?)null, item)).ToList();
        if (isObject && sortKeys) members = members.OrderBy(m => m.key, CodePointOrder).ToList();
        output.Append(isObject ? '{' : '[');
        if (members.Count > 0)
        {
            void Pad(int depth)
            {
                if (!minify) output.Append('\n').Append(' ', indent * depth);
            }
            for (var n = 0; n < members.Count; n++)
            {
                if (n > 0) output.Append(',');
                Pad(level + 1);
                if (isObject)
                {
                    Quote(output, members[n].key!);
                    output.Append(minify ? ":" : ": ");
                }
                Encode(output, members[n].item, indent, level + 1, sortKeys, minify);
            }
            Pad(level);
        }
        output.Append(isObject ? '}' : ']');
    }

    static string Render(JsonElement value, int indent, bool sortKeys, bool minify)
    {
        var output = new StringBuilder();
        Encode(output, value, indent, 0, sortKeys, minify);
        return output.ToString();
    }

    static string ChildPath(string parent, string key)
    {
        if (Identifier.IsMatch(key)) return $"{parent}.{key}";
        var quoted = new StringBuilder();
        Quote(quoted, key);
        return $"{parent}[{quoted}]";
    }

    static void WriteNode(Utf8JsonWriter json, JsonElement value, string path, object? key, int depth, ref int total, ref int maxDepth)
    {
        total++;
        maxDepth = Math.Max(maxDepth, depth);
        var container = value.ValueKind is JsonValueKind.Object or JsonValueKind.Array;
        json.WriteStartObject();
        switch (key)
        {
            case string name: json.WriteString("key", name); break;
            case int index: json.WriteNumber("key", index); break;
            default: json.WriteNull("key"); break;
        }
        json.WriteString("path", path);
        json.WriteString("type", Kind(value));
        json.WriteString("preview", container ? "" : Render(value, 0, false, true));
        json.WriteString("copy_value", Render(value, 2, true, false));
        json.WriteNumber("count", Count(value));
        json.WriteStartArray("children");
        if (value.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in value.EnumerateObject())
                WriteNode(json, property.Value, ChildPath(path, property.Name), property.Name, depth + 1, ref total, ref maxDepth);
        }
        else if (value.ValueKind == JsonValueKind.Array)
        {
            var index = 0;
            foreach (var item in value.EnumerateArray())
            {
                WriteNode(json, item, $"{path}[{index}]", index, depth + 1, ref total, ref maxDepth);
                index++;
            }
        }
        json.WriteEndArray();
        json.WriteEndObject();
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
        return Encoding.UTF8.GetString(buffer.ToArray());
    }
}
