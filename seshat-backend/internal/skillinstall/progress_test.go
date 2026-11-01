package skillinstall

import (
	"context"
	"sync"
	"testing"
)

type recordedProgress struct {
	mu      sync.Mutex
	steps   []string
	indexes []int
	details []string
}

func (p *recordedProgress) Step(index, count int, name string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.steps = append(p.steps, name)
	p.indexes = append(p.indexes, index)
	if count != stepCount {
		panic("the count of steps is fixed")
	}
}

func (p *recordedProgress) Detail(line string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.details = append(p.details, line)
}

func TestEnvironmentReportsItsStepsAndWhatThePackageManagerPrints(t *testing.T) {
	rec := pretendMachine(t, "uvbin", nil)
	// The package manager prints as it works: the lines reach the progress through the context of the command.
	inner := runCommand
	runCommand = func(ctx context.Context, dir string, env []string, name string, args ...string) (string, error) {
		if len(args) > 1 && args[0] == "pip" && args[1] == "install" {
			if sink := linesOf(ctx); sink != nil {
				sink("Resolved 3 packages")
			}
		}
		return inner(ctx, dir, env, name, args...)
	}
	root, envDir, spec := skillRepo(t)
	progress := &recordedProgress{}

	if err := EnvironmentWith(context.Background(), root, envDir, spec, Detect(root, spec), progress); err != nil {
		t.Fatal(err)
	}
	want := []string{"Getting the tools", "Creating the environment", "Installing the packages", "Finishing"}
	if len(progress.steps) != len(want) {
		t.Fatalf("steps %v", progress.steps)
	}
	for i, name := range want {
		if progress.steps[i] != name || progress.indexes[i] != i+1 {
			t.Fatalf("step %d is %q (%d), want %q", i+1, progress.steps[i], progress.indexes[i], name)
		}
	}
	if len(progress.details) != 1 || progress.details[0] != "Resolved 3 packages" {
		t.Fatalf("what was printed is reported: %v", progress.details)
	}
	if !rec.ran("uvbin pip install") {
		t.Fatalf("uv installs: %v", rec.lines())
	}
}

func TestLineWriterSplitsOnNewlinesAndCarriageReturnsAndKeepsEverything(t *testing.T) {
	var got []string
	w := &lineWriter{sink: func(line string) { got = append(got, line) }}
	_, _ = w.Write([]byte("Collecting numpy\nDownloading numpy 10%\rDownloading numpy 60%\r  \nInstal"))
	_, _ = w.Write([]byte("led\n"))
	if len(got) != 4 || got[0] != "Collecting numpy" || got[2] != "Downloading numpy 60%" || got[3] != "Installed" {
		t.Fatalf("got %q", got)
	}
	if w.String() == "" {
		t.Fatal("the whole output is kept for the error message")
	}
}
