// Compiles and runs one visitor program per call, entirely in this WebAssembly
// runtime. Exported to JavaScript (site/run/csharp/worker.js), which owns the
// worker and its lifetime; a runaway program is stopped by terminating it.

using System.Collections.Immutable;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Loader;
using System.Text;
using System.Text.Json;
using Basic.Reference.Assemblies;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

[assembly: System.Runtime.Versioning.SupportedOSPlatform("browser")]

public static partial class Runner
{
    // The SDK's implicit usings for a console app, so snippets need no boilerplate.
    const string ImplicitUsings = """
        global using System;
        global using System.Collections.Generic;
        global using System.IO;
        global using System.Linq;
        global using System.Net.Http;
        global using System.Threading;
        global using System.Threading.Tasks;
        """;

    // The framework plus the libraries the runner ships (embedded images, since
    // assemblies have no file path in WebAssembly): Markdig.
    static readonly ImmutableArray<MetadataReference> References = [.. Net100.References.All, Embedded("Markdig.dll")];

    static MetadataReference Embedded(string name)
    {
        using var stream = typeof(Runner).Assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException($"{name} is not embedded in the runner");
        return MetadataReference.CreateFromStream(stream);
    }

    static readonly CSharpParseOptions ParseOptions = new(LanguageVersion.Latest);
    static readonly SyntaxTree UsingsTree = CSharpSyntaxTree.ParseText(ImplicitUsings, ParseOptions, "Usings.g.cs");
    static readonly CSharpCompilationOptions CompilationOptions = new(
        OutputKind.ConsoleApplication,
        optimizationLevel: OptimizationLevel.Release,
        allowUnsafe: true,
        nullableContextOptions: NullableContextOptions.Enable,
        // Single-threaded WebAssembly cannot block on other threads.
        concurrentBuild: false);

    public static void Main() { }

    [JSExport]
    public static string Version() => Environment.Version.ToString();

    /// <summary>Returns JSON: { ok, stdout, stderr, diagnostics: [{ id, message, severity, start, end }] }.</summary>
    // Console is process-wide, so runs that overlap (one awaiting while another
    // starts) take turns rather than share redirected output.
    static readonly SemaphoreSlim OneAtATime = new(1, 1);

    [JSExport]
    public static async Task<string> Run(string source)
    {
        await OneAtATime.WaitAsync();
        try
        {
            return await CompileAndRun(source);
        }
        finally
        {
            OneAtATime.Release();
        }
    }

    // Tool engines: a library defining `public static class Engine` with
    // `public static string Handle(string input)`, compiled once and kept loaded.
    static readonly Dictionary<string, Func<string, string>> Engines = [];
    static readonly CSharpCompilationOptions LibraryOptions = CompilationOptions.WithOutputKind(OutputKind.DynamicallyLinkedLibrary);

    /// <summary>Compiles and loads an engine; returns "" or the compile errors.</summary>
    [JSExport]
    public static string LoadEngine(string name, string source)
    {
        var tree = CSharpSyntaxTree.ParseText(source, ParseOptions, $"{name}.cs");
        var compilation = CSharpCompilation.Create($"Engine.{name}", [UsingsTree, tree], References, LibraryOptions);
        using var image = new MemoryStream();
        var emitted = compilation.Emit(image);
        if (!emitted.Success)
        {
            return string.Join('\n', emitted.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).Select(d => d.ToString()));
        }
        image.Position = 0;
        var assembly = AssemblyLoadContext.Default.LoadFromStream(image);
        var handle = assembly.GetType("Engine")?.GetMethod("Handle", [typeof(string)]);
        if (handle is null || handle.ReturnType != typeof(string)) return "the engine must define public static string Engine.Handle(string)";
        Engines[name] = handle.CreateDelegate<Func<string, string>>();
        return "";
    }

    /// <summary>Calls a loaded engine with its JSON input; returns its JSON output.</summary>
    [JSExport]
    public static string CallEngine(string name, string input) =>
        Engines.TryGetValue(name, out var handle) ? handle(input) : throw new InvalidOperationException($"engine {name} is not loaded");

    static async Task<string> CompileAndRun(string source)
    {
        var tree = CSharpSyntaxTree.ParseText(source, ParseOptions, "Program.cs");
        var compilation = CSharpCompilation.Create(
            "Program", [UsingsTree, tree], References, CompilationOptions);

        using var image = new MemoryStream();
        var emitted = compilation.Emit(image);
        var diagnostics = emitted.Diagnostics
            .Where(d => d.Severity >= DiagnosticSeverity.Warning && (!d.Location.IsInSource || d.Location.SourceTree == tree))
            .ToList();
        if (!emitted.Success) return Result(false, "", "", diagnostics);

        var stdout = new StringWriter();
        var stderr = new StringWriter();
        var (originalOut, originalError) = (Console.Out, Console.Error);
        Console.SetOut(stdout);
        Console.SetError(stderr);
        var context = new AssemblyLoadContext("visitor", isCollectible: true);
        try
        {
            image.Position = 0;
            await Invoke(context.LoadFromStream(image));
        }
        catch (Exception error)
        {
            stderr.WriteLine($"Unhandled exception. {VisitorTrace(Unwrap(error))}");
        }
        finally
        {
            Console.Out.Flush();
            Console.SetOut(originalOut);
            Console.SetError(originalError);
            context.Unload();
        }
        return Result(true, stdout.ToString(), stderr.ToString(), diagnostics);
    }

    // An async Main (explicit, or top-level code with `await`) compiles to the
    // async method plus a synthesized sync entry point <Main> that blocks on it,
    // and blocking deadlocks single-threaded WebAssembly, so await the async
    // method directly instead.
    static async Task Invoke(Assembly assembly)
    {
        var entry = assembly.EntryPoint ?? throw new InvalidOperationException("The program has no entry point.");
        var target = entry.Name == "<Main>" ? AsyncMain(entry) ?? entry : entry;
        object?[]? arguments = target.GetParameters().Length == 0 ? null : [Array.Empty<string>()];
        var returned = target.Invoke(null, arguments);
        if (returned is Task task) await task;
    }

    // The wrapper's parameters are exactly the async method's, which tells it
    // apart from any other Main overloads.
    static MethodInfo? AsyncMain(MethodInfo wrapper)
    {
        var parameters = wrapper.GetParameters().Select(p => p.ParameterType).ToArray();
        return wrapper.DeclaringType?
            .GetMethods(BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)
            .FirstOrDefault(m => m.Name is "Main" or "<Main>$"
                && !m.IsGenericMethodDefinition
                && typeof(Task).IsAssignableFrom(m.ReturnType)
                && m.GetParameters().Select(p => p.ParameterType).SequenceEqual(parameters));
    }

    static Exception Unwrap(Exception error) =>
        error is TargetInvocationException { InnerException: { } inner } ? inner : error;

    // The visitor's frames only: stop at the first frame of this host (the
    // reflection call into their code, or Runner itself), which sit below it.
    static string VisitorTrace(Exception error) =>
        string.Join('\n', error.ToString().Split('\n').TakeWhile(line =>
            !line.TrimStart().StartsWith("at System.Reflection.") && !line.TrimStart().StartsWith("at Runner.")));

    static string Result(bool ok, string stdout, string stderr, IEnumerable<Diagnostic> diagnostics)
    {
        using var buffer = new MemoryStream();
        using (var json = new Utf8JsonWriter(buffer))
        {
            json.WriteStartObject();
            json.WriteBoolean("ok", ok);
            json.WriteString("stdout", stdout);
            json.WriteString("stderr", stderr);
            json.WriteStartArray("diagnostics");
            foreach (var d in diagnostics)
            {
                json.WriteStartObject();
                json.WriteString("id", d.Id);
                json.WriteString("message", d.GetMessage());
                json.WriteString("severity", d.Severity.ToString());
                json.WriteNumber("start", d.Location.SourceSpan.Start);
                json.WriteNumber("end", d.Location.SourceSpan.End);
                json.WriteEndObject();
            }
            json.WriteEndArray();
            json.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }
}
