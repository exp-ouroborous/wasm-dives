// The Markdown tool's C# engine: Markdig (CommonMark, plus the extensions
// below). Engine.Handle(input JSON) -> output JSON, the contract every
// language's engine follows (tests/engines/markdown-cases.json).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Markdig;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

public static class Engine
{
    static readonly string Name = "Markdig " + (typeof(Markdown).Assembly
        .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "");

    // fenced_code is CommonMark: always on, so asking for it is fine.
    static readonly HashSet<string> Supported = ["fenced_code", "tables", "hard_breaks", "footnotes", "smarty"];

    static readonly Regex Scheme = new(@"^[a-zA-Z][a-zA-Z0-9+.\-]*:");

    public static string Handle(string inputJson)
    {
        using var input = JsonDocument.Parse(inputJson);
        var root = input.RootElement;
        var source = root.TryGetProperty("source", out var s) ? s.GetString() ?? "" : "";
        var features = root.TryGetProperty("features", out var f) ? f.EnumerateArray().Select(x => x.GetString() ?? "").ToList() : [];
        var safe = root.TryGetProperty("safe", out var sf) && sf.ValueKind == JsonValueKind.True;

        var missing = features.Where(x => !Supported.Contains(x)).ToList();
        if (missing.Count > 0)
        {
            return Write(json =>
            {
                json.WriteBoolean("ok", false);
                json.WriteBoolean("unsupported", true);
                json.WriteStartArray("unsupported_features");
                foreach (var m in missing) json.WriteStringValue(m);
                json.WriteEndArray();
                json.WriteString("engine", Name);
                json.WriteString("html", "");
                json.WriteString("error", $"{string.Join(", ", missing)} is not available in C#");
            });
        }

        var builder = new MarkdownPipelineBuilder();
        if (features.Contains("tables")) builder.UsePipeTables();
        if (features.Contains("footnotes")) builder.UseFootnotes();
        if (features.Contains("smarty")) builder.UseSmartyPants();
        if (features.Contains("hard_breaks")) builder.UseSoftlineBreakAsHardlineBreak();
        if (safe) builder.DisableHtml();
        var pipeline = builder.Build();

        var document = Markdown.Parse(source, pipeline);
        // DisableHtml escapes raw HTML but keeps link targets as written, so
        // safe mode also blanks any URL whose scheme is not http(s) or mailto.
        if (safe)
        {
            foreach (var link in document.Descendants<LinkInline>())
            {
                if (!SafeUrl(link.Url)) link.Url = "";
            }
            foreach (var autolink in document.Descendants<AutolinkInline>())
            {
                if (!autolink.IsEmail && !SafeUrl(autolink.Url)) autolink.Url = "";
            }
        }
        var html = document.ToHtml(pipeline);
        return Write(json =>
        {
            json.WriteBoolean("ok", true);
            json.WriteString("engine", Name);
            json.WriteString("html", html);
            json.WriteString("error", "");
        });
    }

    static bool SafeUrl(string? url)
    {
        if (string.IsNullOrEmpty(url)) return true;
        // Browsers ignore control characters and whitespace inside a scheme.
        var compact = new string(url.Where(c => c > ' ').ToArray());
        var scheme = Scheme.Match(compact);
        if (!scheme.Success) return true;  // relative URL
        return scheme.Value.ToLowerInvariant() is "http:" or "https:" or "mailto:";
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
