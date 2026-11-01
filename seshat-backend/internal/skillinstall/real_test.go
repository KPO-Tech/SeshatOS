package skillinstall

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestRealEnvironment installs a real data stack, with pip and then with uv, and says how long each took. It downloads packages, so it
// runs only when asked: SESHAT_REAL_INSTALL=1 go test ./internal/skillinstall -run TestRealEnvironment -v
func TestRealEnvironment(t *testing.T) {
	if os.Getenv("SESHAT_REAL_INSTALL") == "" {
		t.Skip("set SESHAT_REAL_INSTALL=1 to install real packages")
	}
	real := runCommand
	runCommand = func(ctx context.Context, dir string, env []string, name string, args ...string) (string, error) {
		started := time.Now()
		out, err := real(ctx, dir, env, name, args...)
		if time.Since(started) > time.Second {
			t.Logf("  %s %v: %s", filepath.Base(name), args[:min(len(args), 3)], time.Since(started).Round(100*time.Millisecond))
		}
		return out, err
	}
	t.Cleanup(func() { runCommand = real })
	for _, mode := range []string{"", "off", ""} {
		root := t.TempDir()
		write(t, filepath.Join(root, "skills", "a", "SKILL.md"), "---\nname: a\n---\n")
		write(t, filepath.Join(root, "skills", "a", "requirements.txt"), "numpy\npandas\nscipy\nmatplotlib\nscikit-learn\n")
		t.Setenv(EnvUV, mode)
		plan := Detect(root, Spec{})
		started := time.Now()
		if err := Environment(context.Background(), root, filepath.Join(t.TempDir(), "env"), Spec{}, plan); err != nil {
			t.Fatal(err)
		}
		name := "uv"
		if mode == "off" {
			name = "pip"
		}
		t.Logf("%s: %s", name, time.Since(started).Round(100*time.Millisecond))
	}
}
