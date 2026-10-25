//go:build js && wasm

// The Go card's runtime: the Yaegi interpreter compiled to WebAssembly.
// It exposes yaegiRun(source) -> Promise<{stdout, stderr, error}> on the
// global object. Each run gets a fresh interpreter, evaluated in a goroutine:
// evaluating synchronously inside a js.FuncOf callback would deadlock as soon
// as the program blocks on a channel or time.Sleep.
package main

import (
	"bytes"
	"runtime"
	"syscall/js"

	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

func run(_ js.Value, args []js.Value) any {
	source := args[0].String()
	return js.Global().Get("Promise").New(js.FuncOf(func(_ js.Value, p []js.Value) any {
		resolve := p[0]
		go func() {
			var stdout, stderr bytes.Buffer
			i := interp.New(interp.Options{Stdout: &stdout, Stderr: &stderr})
			message := ""
			if err := i.Use(stdlib.Symbols); err != nil {
				message = err.Error()
			} else if _, err := i.Eval(source); err != nil {
				message = err.Error()
			}
			resolve.Invoke(map[string]any{"stdout": stdout.String(), "stderr": stderr.String(), "error": message})
		}()
		return nil
	}))
}

func main() {
	js.Global().Set("yaegiRun", js.FuncOf(run))
	js.Global().Set("yaegiGoVersion", runtime.Version())
	select {}
}
