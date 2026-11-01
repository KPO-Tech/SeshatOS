package skillinstall

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func gitRepoWithASkill(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dir := t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run("init", "-q")
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte("# a skill"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-q", "-m", "first")
	return dir
}

type cloneRecorder struct{ lines []string }

func (r *cloneRecorder) Step(int, int, string) {}
func (r *cloneRecorder) Detail(text string)    { r.lines = append(r.lines, text) }

func TestCloneDownloadsTheRepositoryAndSaysWhatGitPrints(t *testing.T) {
	source := gitRepoWithASkill(t)
	dest := filepath.Join(t.TempDir(), "repo")
	progress := &cloneRecorder{}
	if err := Clone(context.Background(), source, dest, progress); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dest, "SKILL.md")); err != nil {
		t.Fatalf("the files were not downloaded: %v", err)
	}
	if len(progress.lines) == 0 {
		t.Fatal("nothing was reported while downloading")
	}
}

func TestCloneOfAnAddressThatDoesNotExistLeavesNothingAndSaysWhy(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dest := filepath.Join(t.TempDir(), "repo")
	err := Clone(context.Background(), filepath.Join(t.TempDir(), "nothing-here"), dest, nil)
	if err == nil || !strings.Contains(err.Error(), "could not download") {
		t.Fatalf("expected a download error, got %v", err)
	}
	if _, statErr := os.Stat(dest); !os.IsNotExist(statErr) {
		t.Fatal("a failed download left a folder behind")
	}
}

func TestCloneThatIsCancelledLeavesNothing(t *testing.T) {
	source := gitRepoWithASkill(t)
	dest := filepath.Join(t.TempDir(), "repo")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := Clone(ctx, source, dest, nil); err == nil {
		t.Fatal("a cancelled download reported success")
	}
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Fatal("a cancelled download left a folder behind")
	}
}

func TestCloneIntoMovesTheRepositoryOnlyWhenItIsWhole(t *testing.T) {
	source := gitRepoWithASkill(t)
	root := t.TempDir()
	staging := filepath.Join(root, "skill-clones", "repo")
	dest := filepath.Join(root, "skills", "repos", "repo")
	if err := CloneInto(context.Background(), source, staging, dest, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dest, "SKILL.md")); err != nil {
		t.Fatalf("the repository is not in place: %v", err)
	}
	if _, err := os.Stat(staging); !os.IsNotExist(err) {
		t.Fatal("the staging folder was left behind")
	}
}

func TestCloneIntoThatFailsLeavesNothingInPlaceNorInStaging(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	root := t.TempDir()
	staging := filepath.Join(root, "skill-clones", "repo")
	dest := filepath.Join(root, "skills", "repos", "repo")
	// A half download of an earlier attempt is replaced, not trusted.
	if err := os.MkdirAll(filepath.Join(staging, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := CloneInto(context.Background(), filepath.Join(root, "nothing-here"), staging, dest, nil); err == nil {
		t.Fatal("a download that failed reported success")
	}
	for _, path := range []string{staging, dest} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("%s was left behind", path)
		}
	}
}

func TestAnAddressStartingWithADashIsNotTakenForAnOption(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dest := filepath.Join(t.TempDir(), "repo")
	err := Clone(context.Background(), "--upload-pack=touch /tmp/pwned", dest, nil)
	if err == nil || !strings.Contains(err.Error(), "could not download") {
		t.Fatalf("expected a plain download error, got %v", err)
	}
}
