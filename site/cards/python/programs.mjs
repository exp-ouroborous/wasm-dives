// The Python programs the card offers. Each runs on CPython 3.14 (Pyodide) in
// the sandbox runner, exactly like code typed by hand, using only the
// standard library so nothing is downloaded beyond the core runtime.

export const SCRATCHPAD_DEFAULT = `print("Hello from Python, running in your browser!")

squares = [n * n for n in range(1, 11)]
print("squares:", squares)

words = "the quick brown fox jumps over the lazy dog".split()
longest = max(words, key=len)
f"{len(words)} words; the longest is {longest!r}"
`;

export const EXPERIMENTS = [
  {
    id: "csv",
    title: "CSV and statistics",
    blurb: "Parse a CSV with the csv module, then summarise it with statistics and a Counter.",
    source: `import csv
import io
import statistics
from collections import Counter

data = """city,country,population_m
Tokyo,Japan,37.4
Delhi,India,31.0
Shanghai,China,27.1
São Paulo,Brazil,22.0
Mexico City,Mexico,21.8
Cairo,Egypt,21.3
Mumbai,India,20.7
"""

rows = list(csv.DictReader(io.StringIO(data)))
populations = [float(r["population_m"]) for r in rows]
print(f"{len(rows)} cities, mean {statistics.mean(populations):.1f}m, median {statistics.median(populations):.1f}m")
print("stdev:", round(statistics.stdev(populations), 2))
for country, count in Counter(r["country"] for r in rows).most_common(2):
    print(f"{country}: {count} cities")
`,
  },
  {
    id: "dataclasses",
    title: "Dataclasses and pattern matching",
    blurb: "Model shapes as dataclasses and compute their areas with a match statement.",
    source: `from dataclasses import dataclass
import math

@dataclass(frozen=True)
class Circle:
    radius: float

@dataclass(frozen=True)
class Rect:
    width: float
    height: float

def area(shape):
    match shape:
        case Circle(radius=r):
            return math.pi * r * r
        case Rect(width=w, height=h) if w == h:
            return w * w
        case Rect(width=w, height=h):
            return w * h

for shape in [Circle(1.5), Rect(2, 3), Rect(2.5, 2.5)]:
    print(f"{shape!r:<32} area = {area(shape):.2f}")
`,
  },
];

export const PROBE_SOURCE = `import os
import platform
import sys
import time

print("Python:", sys.version.split()[0])
print("Implementation:", platform.python_implementation())
print("Platform:", sys.platform, platform.machine())
print("CPUs:", os.cpu_count())

started = time.perf_counter()
total = sum(range(1_000_000))
print(f"1M-element sum: {(time.perf_counter() - started) * 1000:.0f} ms (sum {total:,})")
`;
