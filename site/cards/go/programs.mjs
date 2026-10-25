// The Go programs the card offers. Each is run by Yaegi in WebAssembly in the
// sandbox runner, exactly like code typed by hand, and avoids the
// interpreter's known gaps (min/max, generic stdlib functions, two-parameter
// type inference).

export const SCRATCHPAD_DEFAULT = `package main

import (
	"fmt"
	"sync"
)

func main() {
	fmt.Println("Hello from Go, interpreted in your browser!")

	var wg sync.WaitGroup
	squares := make(chan int, 5)
	for i := 1; i <= 5; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			squares <- n * n
		}(i)
	}
	wg.Wait()
	close(squares)

	sum := 0
	for s := range squares {
		sum += s
	}
	fmt.Println("sum of squares 1..5:", sum)
}
`;

export const EXPERIMENTS = [
  {
    id: "goroutines",
    title: "Goroutines and channels",
    blurb: "Three workers share a jobs channel, then a select waits for a result or gives up after a timeout.",
    source: `package main

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

func worker(id int, jobs <-chan string, results chan<- string, wg *sync.WaitGroup) {
	defer wg.Done()
	for word := range jobs {
		time.Sleep(10 * time.Millisecond)
		results <- fmt.Sprintf("worker %d: %s -> %s", id, word, strings.ToUpper(word))
	}
}

func main() {
	jobs := make(chan string)
	results := make(chan string, 6)
	var wg sync.WaitGroup
	for id := 1; id <= 3; id++ {
		wg.Add(1)
		go worker(id, jobs, results, &wg)
	}
	for _, word := range []string{"go", "wasm", "yaegi", "browser", "channel", "select"} {
		jobs <- word
	}
	close(jobs)
	wg.Wait()
	close(results)

	var lines []string
	for line := range results {
		lines = append(lines, line)
	}
	sort.Strings(lines)
	fmt.Println(strings.Join(lines, "\\n"))

	done := make(chan string)
	go func() {
		time.Sleep(20 * time.Millisecond)
		done <- "finished in time"
	}()
	select {
	case message := <-done:
		fmt.Println(message)
	case <-time.After(time.Second):
		fmt.Println("timed out")
	}
}
`,
  },
  {
    id: "generics",
    title: "Generics",
    blurb: "A constrained Sum, a generic Stack, and a Map with explicit type arguments.",
    source: `package main

import "fmt"

type Number interface {
	~int | ~float64
}

func Sum[T Number](values []T) T {
	var total T
	for _, v := range values {
		total += v
	}
	return total
}

type Stack[T any] struct {
	items []T
}

func (s *Stack[T]) Push(v T) { s.items = append(s.items, v) }

func (s *Stack[T]) Pop() T {
	last := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return last
}

func Map[T, U any](values []T, f func(T) U) []U {
	out := make([]U, 0, len(values))
	for _, v := range values {
		out = append(out, f(v))
	}
	return out
}

func main() {
	fmt.Println("Sum of ints:", Sum([]int{1, 2, 3, 4}))
	fmt.Println("Sum of floats:", Sum([]float64{1.5, 2.25}))

	stack := &Stack[string]{}
	stack.Push("first")
	stack.Push("second")
	fmt.Println("Popped:", stack.Pop(), "then", stack.Pop())

	labels := Map[int, string]([]int{1, 2, 3}, func(n int) string { return fmt.Sprintf("#%d", n) })
	fmt.Println("Mapped:", labels)
}
`,
  },
];

export const PROBE_SOURCE = `package main

import (
	"fmt"
	"runtime"
	"time"
)

func main() {
	fmt.Println("Go version:", runtime.Version())
	fmt.Println("GOOS/GOARCH:", runtime.GOOS+"/"+runtime.GOARCH)
	fmt.Println("CPUs:", runtime.NumCPU())
	fmt.Println("Goroutines:", runtime.NumGoroutine())

	started := time.Now()
	sum := 0
	for i := 0; i < 1000000; i++ {
		sum += i
	}
	fmt.Printf("1M-iteration loop: %d ms (sum %d)\\n", time.Since(started).Milliseconds(), sum)
}
`;
