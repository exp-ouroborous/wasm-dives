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

// use gives an interpreter the standard library and the compiled-in libraries.
func use(i *interp.Interpreter) error {
	if err := i.Use(stdlib.Symbols); err != nil {
		return err
	}
	return i.Use(Symbols)
}

func run(_ js.Value, args []js.Value) any {
	source := args[0].String()
	return js.Global().Get("Promise").New(js.FuncOf(func(_ js.Value, p []js.Value) any {
		resolve := p[0]
		go func() {
			var stdout, stderr bytes.Buffer
			i := interp.New(interp.Options{Stdout: &stdout, Stderr: &stderr})
			message := ""
			if err := use(i); err != nil {
				message = err.Error()
			} else if _, err := i.Eval(source); err != nil {
				message = err.Error()
			}
			resolve.Invoke(map[string]any{"stdout": stdout.String(), "stderr": stderr.String(), "error": message})
		}()
		return nil
	}))
}

// Tool engines: each is a persistent interpreter holding the engine's
// func Handle(string) string, loaded once and then called per input.
var engines = map[string]func(string) string{}

func promise(work func() (string, string)) any {
	return js.Global().Get("Promise").New(js.FuncOf(func(_ js.Value, p []js.Value) any {
		resolve, reject := p[0], p[1]
		go func() {
			value, failure := work()
			if failure != "" {
				reject.Invoke(js.Global().Get("Error").New(failure))
				return
			}
			resolve.Invoke(value)
		}()
		return nil
	}))
}

// yaegiLoad(name, source) -> Promise<string>: "" when loaded, else the error.
func load(_ js.Value, args []js.Value) any {
	name, source := args[0].String(), args[1].String()
	return promise(func() (string, string) {
		i := interp.New(interp.Options{})
		if err := use(i); err != nil {
			return err.Error(), ""
		}
		if _, err := i.Eval(source); err != nil {
			return err.Error(), ""
		}
		value, err := i.Eval("main.Handle")
		if err != nil {
			return err.Error(), ""
		}
		handle, ok := value.Interface().(func(string) string)
		if !ok {
			return "engine must define func Handle(string) string", ""
		}
		engines[name] = handle
		return "", ""
	})
}

// yaegiCall(name, input) -> Promise<string> with the engine's output.
func call(_ js.Value, args []js.Value) any {
	name, input := args[0].String(), args[1].String()
	return promise(func() (string, string) {
		handle, ok := engines[name]
		if !ok {
			return "", "engine " + name + " is not loaded"
		}
		return handle(input), ""
	})
}

func main() {
	js.Global().Set("yaegiLoad", js.FuncOf(load))
	js.Global().Set("yaegiCall", js.FuncOf(call))
	js.Global().Set("yaegiRun", js.FuncOf(run))
	js.Global().Set("yaegiGoVersion", runtime.Version())
	select {}
}
