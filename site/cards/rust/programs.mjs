// The Rust programs the card offers. Each is interpreted by Miri in the
// sandbox runner, exactly like code typed by hand. Miri is slow (it
// interprets every step), so these stay small.

export const SCRATCHPAD_DEFAULT = `use std::collections::HashMap;

#[derive(Debug)]
enum Shape {
    Circle { radius: f64 },
    Rect { w: f64, h: f64 },
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle { radius } => std::f64::consts::PI * radius * radius,
            Shape::Rect { w, h } => w * h,
        }
    }
}

fn main() {
    println!("Hello from Rust, interpreted in your browser!");

    let shapes = vec![Shape::Circle { radius: 1.5 }, Shape::Rect { w: 2.0, h: 3.0 }];
    for shape in &shapes {
        println!("{shape:?} has area {:.2}", shape.area());
    }

    let mut letters: HashMap<char, usize> = HashMap::new();
    for c in "webassembly".chars() {
        *letters.entry(c).or_default() += 1;
    }
    let mut repeated: Vec<_> = letters.into_iter().filter(|&(_, n)| n > 1).collect();
    repeated.sort();
    println!("repeated letters: {repeated:?}");
}
`;

export const EXPERIMENTS = [
  {
    id: "ownership",
    title: "Ownership and errors",
    blurb: "Moving and borrowing a String, then parsing input with Result and the ? operator.",
    options: {},
    source: `use std::num::ParseIntError;

fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() { a } else { b }
}

fn sum_numbers(text: &str) -> Result<i64, ParseIntError> {
    let mut total = 0;
    for part in text.split(',') {
        total += part.trim().parse::<i64>()?;
    }
    Ok(total)
}

fn main() {
    let owned = String::from("ferris");
    let borrowed = &owned;
    println!("borrowed {borrowed}, still own {owned}");
    let moved = owned; // owned is moved here and can no longer be used
    println!("longest: {}", longest(&moved, "crab"));

    for input in ["1, 2, 3", "4, five, 6"] {
        match sum_numbers(input) {
            Ok(total) => println!("{input:?} sums to {total}"),
            Err(error) => println!("{input:?} failed: {error}"),
        }
    }
}
`,
  },
  {
    id: "traits",
    title: "Traits and closures",
    blurb: "A trait with a default method, generic and dynamic dispatch, and iterator closures.",
    options: {},
    source: `trait Animal {
    fn name(&self) -> String;
    fn sound(&self) -> &'static str;
    fn speak(&self) -> String {
        format!("{} says {}", self.name(), self.sound())
    }
}

struct Crab;
struct Cat { lives: u8 }

impl Animal for Crab {
    fn name(&self) -> String { "Ferris".into() }
    fn sound(&self) -> &'static str { "click" }
}

impl Animal for Cat {
    fn name(&self) -> String { format!("a cat with {} lives", self.lives) }
    fn sound(&self) -> &'static str { "meow" }
}

fn loudest<T: Animal>(animal: &T) -> String {
    animal.speak().to_uppercase()
}

fn main() {
    let zoo: Vec<Box<dyn Animal>> = vec![Box::new(Crab), Box::new(Cat { lives: 9 })];
    for animal in &zoo {
        println!("{}", animal.speak());
    }
    println!("{}", loudest(&Crab));

    let squares: Vec<u32> = (1..=8).filter(|n| n % 2 == 0).map(|n| n * n).collect();
    let total: u32 = squares.iter().sum();
    println!("even squares {squares:?} sum to {total}");
}
`,
  },
];

export const PROBE_OPTIONS = {};

export const PROBE_SOURCE = `use std::time::Instant;

fn main() {
    // Miri interprets the program as if it ran on this target...
    println!("Target Miri pretends to be: {} on {}", std::env::consts::ARCH, std::env::consts::OS);
    println!("usize: {} bits, pointer: {} bytes", usize::BITS, std::mem::size_of::<*const u8>());
    // ...while it is really WebAssembly in your browser, interpreting each step.
    let started = Instant::now();
    let mut sum: u64 = 0;
    for i in 0..100_000u64 {
        sum = sum.wrapping_add(i);
    }
    println!("100k-iteration loop: {} ms (sum {sum})", started.elapsed().as_millis());
}
`;
