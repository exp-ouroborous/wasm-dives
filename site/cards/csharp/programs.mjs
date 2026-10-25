// The C# programs the card offers. Every one is compiled by Roslyn and run on
// .NET WebAssembly in the sandbox runner, exactly like code typed by hand.

export const SCRATCHPAD_DEFAULT = `using System;
using System.Linq;

Console.WriteLine("Hello from C#, compiled in your browser!");

var squares = Enumerable.Range(1, 10).Select(n => n * n);
Console.WriteLine(string.Join(", ", squares));
`;

export const EXPERIMENTS = [
  {
    id: "linq-csv",
    title: "LINQ over a CSV",
    blurb: "Parse a small CSV with raw string literals and tuples, then group and sum it with LINQ.",
    source: `using System;
using System.Linq;

var csv = """
city,country,population
Tokyo,Japan,37400000
Delhi,India,31000000
Shanghai,China,27100000
São Paulo,Brazil,22000000
Mexico City,Mexico,21800000
Cairo,Egypt,21300000
Mumbai,India,20700000
""";

var rows = csv.Split('\\n', StringSplitOptions.RemoveEmptyEntries)
    .Skip(1)
    .Select(line => line.Split(','))
    .Select(f => (City: f[0], Country: f[1], Population: long.Parse(f[2])));

foreach (var country in rows.GroupBy(r => r.Country).OrderByDescending(g => g.Count()))
{
    var people = country.Aggregate(0L, (total, r) => total + r.Population);
    Console.WriteLine($"{country.Key.PadRight(8)} {country.Count()} cities  {people.ToString("N0")} people");
}
`,
  },
  {
    id: "records",
    title: "Records and pattern matching",
    blurb: "Model shapes as records and compute areas with a switch expression.",
    source: `using System;
using System.Collections.Generic;

var shapes = new List<Shape> { new Circle(1.5), new Rect(2, 3), new Square(2.5) };
foreach (var shape in shapes)
{
    Console.WriteLine($"{shape.ToString().PadRight(30)} area = {Area(shape).ToString("F2")}");
}

const double Pi = 3.141592653589793;

static double Area(Shape shape) => shape switch
{
    Circle c => Pi * c.Radius * c.Radius,
    Square s => s.Side * s.Side,
    Rect r => r.Width * r.Height,
    _ => throw new ArgumentException("unknown shape"),
};

abstract record Shape;
record Circle(double Radius) : Shape;
record Rect(double Width, double Height) : Shape;
record Square(double Side) : Shape;
`,
  },
];

export const PROBE_SOURCE = `using System;
using System.Globalization;

Console.WriteLine($".NET version: {Environment.Version}");
Console.WriteLine($"OS version: {Environment.OSVersion}");
Console.WriteLine($"64-bit process: {Environment.Is64BitProcess}");
Console.WriteLine($"Processor count: {Environment.ProcessorCount}");
Console.WriteLine($"Culture: {CultureInfo.CurrentCulture.Name}");
Console.WriteLine($"GC heap bytes: {GC.GetTotalMemory(false).ToString("N0")}");

var started = DateTime.UtcNow;
long sum = 0;
for (var i = 0; i < 10_000_000; i++) sum += i;
var elapsed = (DateTime.UtcNow - started).TotalMilliseconds;
Console.WriteLine($"10M-iteration loop: {elapsed.ToString("F0")} ms (sum {sum.ToString("N0")})");
`;
