package gitstate

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func run(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"}, args...)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func newRepo(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dir := t.TempDir()
	run(t, dir, "init", "-q", "-b", "main")
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}
	run(t, dir, "add", "a.txt")
	run(t, dir, "commit", "-q", "-m", "first")
	return dir
}

func TestInspectNamesTheBranchAndNoticesChanges(t *testing.T) {
	dir := newRepo(t)
	state := Inspect(context.Background(), dir)
	if !state.Repo || state.Branch != "main" || state.Dirty || state.Detached {
		t.Fatalf("clean checkout: %+v", state)
	}

	if err := os.WriteFile(filepath.Join(dir, "b.txt"), []byte("b"), 0o644); err != nil {
		t.Fatal(err)
	}
	if state := Inspect(context.Background(), dir); !state.Dirty {
		t.Fatalf("an untracked file is a change: %+v", state)
	}

	run(t, dir, "checkout", "-q", "-b", "feature/x")
	if state := Inspect(context.Background(), dir); state.Branch != "feature/x" {
		t.Fatalf("branch change not followed: %+v", state)
	}
}

func TestInspectDetachedHeadGivesTheShortCommit(t *testing.T) {
	dir := newRepo(t)
	run(t, dir, "checkout", "-q", "--detach")
	state := Inspect(context.Background(), dir)
	if !state.Detached || len(state.Branch) < 7 || state.Branch == "HEAD" {
		t.Fatalf("detached: %+v", state)
	}
}

func TestInspectBranchWithoutCommit(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dir := t.TempDir()
	run(t, dir, "init", "-q", "-b", "main")
	if state := Inspect(context.Background(), dir); !state.Repo || state.Branch != "main" {
		t.Fatalf("empty checkout: %+v", state)
	}
}

func TestInspectOutsideARepository(t *testing.T) {
	if state := Inspect(context.Background(), t.TempDir()); state.Repo {
		t.Fatalf("not a repository: %+v", state)
	}
	if state := Inspect(context.Background(), ""); state.Repo {
		t.Fatalf("no folder: %+v", state)
	}
}
