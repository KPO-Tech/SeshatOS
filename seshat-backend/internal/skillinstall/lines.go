package skillinstall

import (
	"bytes"
	"context"
	"strings"
	"sync"
)

type lineSinkKey struct{}

// withLines makes the programs run with this context report what they print, line by line, as they print it.
func withLines(ctx context.Context, sink func(string)) context.Context {
	if sink == nil {
		return ctx
	}
	return context.WithValue(ctx, lineSinkKey{}, sink)
}

func linesOf(ctx context.Context) func(string) {
	sink, _ := ctx.Value(lineSinkKey{}).(func(string))
	return sink
}

// maxLine keeps one line of output short enough to show.
const maxLine = 160

// lineWriter keeps everything a program prints, and hands each line to a sink as soon as it is complete. Progress bars end their lines with a
// carriage return, so both ends of line count.
type lineWriter struct {
	mu      sync.Mutex
	all     bytes.Buffer
	partial []byte
	sink    func(string)
}

func (w *lineWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.all.Write(p)
	if w.sink == nil {
		return len(p), nil
	}
	for _, b := range p {
		if b == '\n' || b == '\r' {
			w.flush()
			continue
		}
		w.partial = append(w.partial, b)
	}
	return len(p), nil
}

func (w *lineWriter) flush() {
	line := strings.TrimSpace(string(w.partial))
	w.partial = w.partial[:0]
	if line == "" {
		return
	}
	if len(line) > maxLine {
		line = line[:maxLine]
	}
	w.sink(line)
}

// String is everything the program printed, for the error shown when it fails.
func (w *lineWriter) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.all.String()
}
