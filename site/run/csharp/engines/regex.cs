// The regex tool's C# engine: analyse a pattern with .NET's
// System.Text.RegularExpressions. Engine.Handle(input JSON) -> output JSON,
// the contract every language's engine follows (offsets in Unicode code
// points; replacements written $1 / $name).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

public static class Engine
{
    const string Name = ".NET System.Text.RegularExpressions";

    // A pattern that backtracks catastrophically stops here rather than hanging.
    static readonly TimeSpan Timeout = TimeSpan.FromSeconds(2);

    public static string Handle(string inputJson)
    {
        using var input = JsonDocument.Parse(inputJson);
        var root = input.RootElement;
        var pattern = root.GetProperty("pattern").GetString() ?? "";
        var text = root.GetProperty("text").GetString() ?? "";
        var replacement = root.TryGetProperty("replacement", out var r) ? r.GetString() ?? "" : "";
        var flags = root.TryGetProperty("flags", out var f) ? f.EnumerateArray().Select(x => x.GetString()).ToHashSet() : [];

        var options = RegexOptions.None;
        if (flags.Contains("ignorecase")) options |= RegexOptions.IgnoreCase;
        if (flags.Contains("multiline")) options |= RegexOptions.Multiline;
        if (flags.Contains("dotall")) options |= RegexOptions.Singleline;

        try
        {
            var regex = new Regex(pattern, options, Timeout);
            var names = regex.GetGroupNames().Where(n => !int.TryParse(n, out _)).ToArray();
            var matches = regex.Matches(text).ToArray();
            // \A and \z anchor the whole input (^/$ would allow a final newline, or one line under Multiline).
            var full = Regex.IsMatch(text, $@"\A(?:{pattern})\z", options, Timeout);
            return Write(json =>
            {
                json.WriteBoolean("ok", true);
                json.WriteString("error", "");
                json.WriteString("engine", Name);
                json.WriteNumber("match_count", matches.Length);
                json.WriteStartArray("matches");
                for (var i = 0; i < matches.Length; i++)
                {
                    var m = matches[i];
                    json.WriteStartObject();
                    json.WriteNumber("index", i + 1);
                    json.WriteString("match", m.Value);
                    json.WriteNumber("start", CodePoints(text, m.Index));
                    json.WriteNumber("end", CodePoints(text, m.Index + m.Length));
                    json.WriteStartObject("groups");
                    foreach (var n in names) WriteGroup(json, n, m.Groups[n]);
                    json.WriteEndObject();
                    json.WriteStartArray("numbered_groups");
                    for (var g = 1; g < m.Groups.Count; g++) WriteGroup(json, null, m.Groups[g]);
                    json.WriteEndArray();
                    json.WriteEndObject();
                }
                json.WriteEndArray();
                json.WriteString("substitution", replacement.Length == 0 ? "" : regex.Replace(text, Template(replacement)));
                json.WriteBoolean("full_match", full);
            });
        }
        catch (Exception error) when (error is ArgumentException or RegexMatchTimeoutException)
        {
            return Write(json =>
            {
                json.WriteBoolean("ok", false);
                json.WriteString("error", error.Message);
                json.WriteString("engine", Name);
                json.WriteNumber("match_count", 0);
                json.WriteStartArray("matches");
                json.WriteEndArray();
                json.WriteString("substitution", "");
                json.WriteBoolean("full_match", false);
            });
        }
    }

    // A failed group is null, like Python's.
    static void WriteGroup(Utf8JsonWriter json, string? name, Group group)
    {
        if (name is not null) json.WritePropertyName(name);
        if (group.Success) json.WriteStringValue(group.Value);
        else json.WriteNullValue();
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

    // UTF-16 index -> Unicode code points (a surrogate pair counts once).
    static int CodePoints(string text, int index)
    {
        var count = 0;
        for (var i = 0; i < index; i++)
        {
            if (!char.IsLowSurrogate(text[i])) count++;
        }
        return count;
    }

    // $name -> ${name}; $1 already means group 1 in .NET.
    static string Template(string replacement) =>
        Regex.Replace(replacement, @"\$([A-Za-z_][A-Za-z0-9_]*)", "$${$1}");
}
